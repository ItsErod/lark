//! Windows login item and folder reveal.
//!
//! Open at login writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
//! through the registry API. Showing a clip uses the shell item API.
//! Neither path starts a command interpreter.

use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
use windows_sys::Win32::System::Com::{
    CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_SET_VALUE, REG_SZ,
};
use windows_sys::Win32::UI::Shell::{
    ILCreateFromPathW, ILFree, SHOpenFolderAndSelectItems, ShellExecuteW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "Lark";
const RPC_E_CHANGED_MODE: i32 = 0x8001_0106u32 as i32;

pub fn set_run_at_login(enabled: bool, exe: &Path) -> Result<(), String> {
    let subkey = wide_str(RUN_KEY);
    let name = wide_str(RUN_VALUE);
    unsafe {
        if enabled {
            let mut key: HKEY = std::ptr::null_mut();
            let status = RegCreateKeyW(HKEY_CURRENT_USER, subkey.as_ptr(), &mut key);
            if status != ERROR_SUCCESS {
                return Err("Could not update login items.".into());
            }
            let stored = crate::platform::windows_run_value(&exe.display().to_string());
            let value = wide_str(&stored);
            let bytes = std::slice::from_raw_parts(value.as_ptr() as *const u8, value.len() * 2);
            let set = RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                REG_SZ,
                bytes.as_ptr(),
                bytes.len() as u32,
            );
            let _ = RegCloseKey(key);
            if set != ERROR_SUCCESS {
                return Err("Could not update login items.".into());
            }
            Ok(())
        } else {
            let mut key: HKEY = std::ptr::null_mut();
            let status = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                0,
                KEY_SET_VALUE,
                &mut key,
            );
            if status == ERROR_FILE_NOT_FOUND {
                return Ok(());
            }
            if status != ERROR_SUCCESS {
                return Err("Could not update login items.".into());
            }
            let deleted = RegDeleteValueW(key, name.as_ptr());
            let _ = RegCloseKey(key);
            if deleted == ERROR_SUCCESS || deleted == ERROR_FILE_NOT_FOUND {
                Ok(())
            } else {
                Err("Could not update login items.".into())
            }
        }
    }
}

pub fn reveal_file(path: &Path) -> Result<(), String> {
    with_com(|| unsafe {
        let wide = wide_path(path);
        let pidl = ILCreateFromPathW(wide.as_ptr());
        if pidl.is_null() {
            return Err("Explorer could not show that clip.".into());
        }
        let hr = SHOpenFolderAndSelectItems(pidl, 0, std::ptr::null(), 0);
        ILFree(pidl);
        if hr >= 0 {
            Ok(())
        } else {
            Err("Explorer could not show that clip.".into())
        }
    })
}

pub fn open_folder(dir: &Path) -> Result<(), String> {
    with_com(|| unsafe {
        let operation = wide_str("explore");
        let file = wide_path(dir);
        let inst = ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        );
        if (inst as isize) > 32 {
            Ok(())
        } else {
            Err("Explorer could not open the clips folder.".into())
        }
    })
}

fn with_com<T>(body: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    unsafe {
        let hr = CoInitializeEx(
            std::ptr::null(),
            (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
        );
        let uninit = hr == 0 || hr == 1;
        if hr < 0 && hr != RPC_E_CHANGED_MODE {
            return Err("Couldn't open Explorer.".into());
        }
        let result = body();
        if uninit {
            CoUninitialize();
        }
        result
    }
}

fn wide_str(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn wide_path(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}
