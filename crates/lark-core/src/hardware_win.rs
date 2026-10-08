//! Windows hardware sample. Uses documented user-mode APIs only.
//!
//! Memory is `GlobalMemoryStatusEx`. CPU is two `GetSystemTimes` reads.
//! The GPU name comes from `EnumDisplayDevicesW`. The foreground game and the
//! process list come from one Toolhelp snapshot, which does not open another
//! process. CPU temperature is omitted: the previous reading required WMI.

use std::mem::{size_of, zeroed};

use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Graphics::Gdi::{EnumDisplayDevicesW, DISPLAY_DEVICEW};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows_sys::Win32::System::Threading::GetSystemTimes;
use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

use super::{pick_game, prefer_gpu, HardwareReading, MemorySample};

pub(super) fn gpu_name() -> Option<String> {
    let mut names = Vec::new();
    for index in 0..16 {
        let mut device: DISPLAY_DEVICEW = unsafe { zeroed() };
        device.cb = size_of::<DISPLAY_DEVICEW>() as u32;
        let ok = unsafe { EnumDisplayDevicesW(std::ptr::null(), index, &mut device, 0) };
        if ok == 0 {
            break;
        }
        let name = wide_to_string(&device.DeviceString);
        if !name.is_empty() {
            names.push(name);
        }
    }
    prefer_gpu(names)
}

pub(super) fn sample() -> HardwareReading {
    let memory = memory();
    let (foreground, processes) = processes();
    HardwareReading {
        gpu: None,
        cpu_temp_c: None,
        game: pick_game(foreground.as_deref(), &processes),
        cpu_percent: cpu_percent(),
        ram_used_mb: memory.map(|item| item.used_mb),
        ram_total_mb: memory.map(|item| item.total_mb),
    }
}

fn memory() -> Option<MemorySample> {
    let mut status: MEMORYSTATUSEX = unsafe { zeroed() };
    status.dwLength = size_of::<MEMORYSTATUSEX>() as u32;
    let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
    if ok == 0 || status.ullTotalPhys == 0 {
        return None;
    }
    let total_mb = (status.ullTotalPhys / (1024 * 1024)) as u32;
    if total_mb == 0 {
        return None;
    }
    let avail_mb = (status.ullAvailPhys / (1024 * 1024)) as u32;
    let used_mb = total_mb.saturating_sub(avail_mb.min(total_mb));
    Some(MemorySample { used_mb, total_mb })
}

fn cpu_percent() -> Option<u8> {
    let first = system_times()?;
    std::thread::sleep(std::time::Duration::from_millis(150));
    let second = system_times()?;
    let idle = second.0.saturating_sub(first.0);
    let total = second.1.saturating_sub(first.1);
    crate::platform::cpu_busy_percent(idle, total)
}

fn system_times() -> Option<(u64, u64)> {
    let mut idle = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut kernel = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut user = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) };
    if ok == 0 {
        return None;
    }
    let idle_v = filetime(idle);
    let kernel_v = filetime(kernel);
    let user_v = filetime(user);
    Some((idle_v, kernel_v.saturating_add(user_v)))
}

fn filetime(value: FILETIME) -> u64 {
    (u64::from(value.dwHighDateTime) << 32) | u64::from(value.dwLowDateTime)
}

fn processes() -> (Option<String>, Vec<String>) {
    let foreground_pid = foreground_pid();
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot.is_null() || snapshot == INVALID_HANDLE_VALUE {
        return (None, Vec::new());
    }
    let mut entry: PROCESSENTRY32W = unsafe { zeroed() };
    entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
    let mut names = Vec::new();
    let mut foreground = None;
    let mut ok = unsafe { Process32FirstW(snapshot, &mut entry) };
    while ok != 0 && names.len() < 4000 {
        let name = wide_to_string(&entry.szExeFile);
        if !name.is_empty() {
            if foreground_pid == Some(entry.th32ProcessID) && foreground.is_none() {
                foreground = Some(name.clone());
            }
            names.push(name);
        }
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        ok = unsafe { Process32NextW(snapshot, &mut entry) };
    }
    unsafe {
        let _ = CloseHandle(snapshot);
    }
    (foreground, names)
}

fn foreground_pid() -> Option<u32> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut pid);
    }
    if pid == 0 {
        None
    } else {
        Some(pid)
    }
}

fn wide_to_string(buf: &[u16]) -> String {
    let end = buf.iter().position(|unit| *unit == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end]).trim().to_string()
}
