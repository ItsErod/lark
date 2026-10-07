//! Faststart MP4 muxer for clip files.
//!
//! Discord plays an attachment inline when the file is an H.264 + AAC MP4 and the
//! `moov` atom is before `mdat`. The samples are known before the file is written,
//! so the chunk offsets can be filled in and `moov` goes at the front.

pub const AAC_SAMPLE_RATE: u32 = 44_100;
pub const AAC_FRAME_SAMPLES: u32 = 1_024;
/// Raw AAC-LC frame of silence at 44.1 kHz stereo. The matching AudioSpecificConfig is `12 10`.
const SILENT_AAC: [u8; 6] = [0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c];

pub struct VideoTrack<'a> {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub sps: &'a [u8],
    pub pps: &'a [u8],
    pub samples: &'a [Vec<u8>],
    pub sync: &'a [bool],
}

pub fn mux_h264_aac(video: &VideoTrack<'_>) -> Result<Vec<u8>, String> {
    if video.samples.is_empty() || video.fps == 0 || video.width == 0 || video.height == 0 {
        return Err("There is nothing to mux.".into());
    }
    if video.sps.len() < 4 || video.pps.is_empty() {
        return Err("The encoder did not write H.264 parameter sets.".into());
    }
    if video.sync.len() != video.samples.len() {
        return Err("Encoder sync flags do not match the frames.".into());
    }
    let audio_frames = aac_frame_count(video.samples.len(), video.fps);
    let mut payload = Vec::new();
    for sample in video.samples {
        if sample.is_empty() {
            return Err("The encoder wrote an empty frame.".into());
        }
        payload.extend_from_slice(sample);
    }
    let audio_at = payload.len();
    for _ in 0..audio_frames {
        payload.extend_from_slice(&SILENT_AAC);
    }
    let video_ms = (video.samples.len() as u64 * 1000 / u64::from(video.fps.max(1))) as u32;
    let audio_ms = (u64::from(audio_frames) * u64::from(AAC_FRAME_SAMPLES) * 1000
        / u64::from(AAC_SAMPLE_RATE)) as u32;
    let movie_ms = video_ms.max(audio_ms).max(1);
    let ftyp = ftyp();
    let mut moov = moov(video, movie_ms, video_ms, audio_ms, audio_frames, 0, 0);
    let data_at = ftyp.len() + moov.len() + 8;
    assign_chunk_offsets(&mut moov, &[data_at as u32, (data_at + audio_at) as u32])?;
    let mut out = Vec::with_capacity(data_at + payload.len());
    out.extend_from_slice(&ftyp);
    out.extend_from_slice(&moov);
    out.extend_from_slice(&box_wrap(b"mdat", &payload));
    require_discord_mp4(&out)?;
    Ok(out)
}

pub fn aac_frame_count(video_frames: usize, fps: u32) -> u32 {
    let fps = u64::from(fps.max(1));
    let samples = (video_frames as u64 * u64::from(AAC_SAMPLE_RATE) + fps - 1) / fps;
    ((samples + u64::from(AAC_FRAME_SAMPLES) - 1) / u64::from(AAC_FRAME_SAMPLES)).max(1) as u32
}

/// One encoded video track whose sample durations are already in `timescale` units.
pub struct EncodedVideo<'a> {
    pub width: u32,
    pub height: u32,
    pub timescale: u32,
    pub sample_entry: &'a [u8],
    pub samples: &'a [&'a [u8]],
    pub sync: &'a [bool],
    pub durations: &'a [u32],
    pub hevc: bool,
}

/// Remux encoded access units and silent AAC into a faststart MP4.
pub fn mux_encoded(video: &EncodedVideo<'_>) -> Result<Vec<u8>, String> {
    if video.samples.is_empty()
        || video.timescale == 0
        || video.width == 0
        || video.height == 0
        || video.sample_entry.is_empty()
    {
        return Err("There is nothing to mux.".into());
    }
    if video.sync.len() != video.samples.len() || video.durations.len() != video.samples.len() {
        return Err("Encoder timing does not match the frames.".into());
    }
    let mut payload = Vec::new();
    for sample in video.samples {
        if sample.is_empty() {
            return Err("The encoder wrote an empty frame.".into());
        }
        payload.extend_from_slice(sample);
    }
    let units: u64 = video
        .durations
        .iter()
        .map(|duration| u64::from(*duration))
        .sum();
    let video_ms = ((units.saturating_mul(1000)) / u64::from(video.timescale.max(1))).max(1) as u32;
    let audio_frames = aac_frame_count_ms(video_ms);
    let audio_at = payload.len();
    for _ in 0..audio_frames {
        payload.extend_from_slice(&SILENT_AAC);
    }
    let audio_ms = (u64::from(audio_frames) * u64::from(AAC_FRAME_SAMPLES) * 1000
        / u64::from(AAC_SAMPLE_RATE)) as u32;
    let movie_ms = video_ms.max(audio_ms).max(1);
    let ftyp = if video.hevc { ftyp_hevc() } else { ftyp() };
    let mut moov = moov_timed(
        video,
        units.min(u64::from(u32::MAX)) as u32,
        movie_ms,
        video_ms,
        audio_ms,
        audio_frames,
    );
    let data_at = ftyp.len() + moov.len() + 8;
    if data_at > u32::MAX as usize || data_at + audio_at > u32::MAX as usize {
        return Err("The clip is too large to remux.".into());
    }
    assign_chunk_offsets(&mut moov, &[data_at as u32, (data_at + audio_at) as u32])?;
    let mut out = Vec::with_capacity(data_at + payload.len());
    out.extend_from_slice(&ftyp);
    out.extend_from_slice(&moov);
    out.extend_from_slice(&box_wrap(b"mdat", &payload));
    require_clip_mp4(&out)?;
    Ok(out)
}

fn aac_frame_count_ms(video_ms: u32) -> u32 {
    let samples = (u64::from(video_ms.max(1)) * u64::from(AAC_SAMPLE_RATE) + 999) / 1000;
    ((samples + u64::from(AAC_FRAME_SAMPLES) - 1) / u64::from(AAC_FRAME_SAMPLES)).max(1) as u32
}

/// Move `moov` ahead of `mdat` and patch sample offsets. A file that is already
/// faststart is returned unchanged.
pub fn ensure_faststart(input: &[u8]) -> Result<Vec<u8>, String> {
    let boxes = parse_boxes(input)?;
    let moov_at = boxes
        .iter()
        .position(|item| item.kind == *b"moov")
        .ok_or("The clip is missing a moov atom.")?;
    let mdat_at = boxes
        .iter()
        .position(|item| item.kind == *b"mdat")
        .ok_or("The clip is missing media data.")?;
    if moov_at < mdat_at {
        return Ok(input.to_vec());
    }
    let mut order = Vec::with_capacity(boxes.len());
    for (index, _) in boxes.iter().enumerate() {
        if index == moov_at {
            continue;
        }
        if index == mdat_at {
            order.push(moov_at);
        }
        order.push(index);
    }
    let mut cursor = 0usize;
    let mut new_mdat_data = 0usize;
    for index in &order {
        if *index == mdat_at {
            new_mdat_data = cursor + boxes[*index].header;
        }
        cursor += boxes[*index].total;
    }
    let old_mdat_data = boxes[mdat_at].start + boxes[mdat_at].header;
    let delta = new_mdat_data as i64 - old_mdat_data as i64;
    let mut moov = input[boxes[moov_at].range()].to_vec();
    shift_chunk_offsets(&mut moov, delta)?;
    let mut out = Vec::with_capacity(input.len());
    for index in order {
        if index == moov_at {
            out.extend_from_slice(&moov);
        } else {
            out.extend_from_slice(&input[boxes[index].range()]);
        }
    }
    Ok(out)
}

pub fn require_discord_mp4(bytes: &[u8]) -> Result<(), String> {
    require_mp4(bytes, false)
}

/// Faststart H.264 or HEVC with AAC. The hardware ring uses HEVC when it is available.
pub fn require_clip_mp4(bytes: &[u8]) -> Result<(), String> {
    require_mp4(bytes, true)
}

fn require_mp4(bytes: &[u8], allow_hevc: bool) -> Result<(), String> {
    if bytes.len() < 16 || &bytes[4..8] != b"ftyp" {
        return Err("The clip is not an MP4.".into());
    }
    let boxes = parse_boxes(bytes)?;
    let moov = boxes
        .iter()
        .find(|item| item.kind == *b"moov")
        .ok_or("The clip is missing a moov atom.")?;
    let mdat = boxes
        .iter()
        .find(|item| item.kind == *b"mdat")
        .ok_or("The clip is missing media data.")?;
    if !moov_before_mdat(bytes) {
        return Err("The moov atom is not at the front of the clip.".into());
    }
    let moov_bytes = &bytes[moov.range()];
    let hevc = sample_entry(moov_bytes, b"hvc1");
    let avc = sample_entry(moov_bytes, b"avc1");
    if hevc {
        if !allow_hevc {
            return Err("The clip video is not H.264.".into());
        }
        let hvcc =
            find_box(moov_bytes, b"hvcC").ok_or("The clip is missing HEVC configuration.")?;
        if hvcc.len() < 24 || hvcc[8] != 1 {
            return Err("The clip uses an unsupported HEVC layout.".into());
        }
    } else if avc {
        let avcc =
            find_box(moov_bytes, b"avcC").ok_or("The clip is missing H.264 configuration.")?;
        if avcc.len() < 13 || avcc[8] != 1 || avcc[12] & 0x03 != 0x03 {
            return Err("The clip uses an unsupported H.264 layout.".into());
        }
        let profile = avcc[9];
        if !matches!(profile, 66 | 77 | 100) {
            return Err("The clip video profile will not play everywhere.".into());
        }
    } else {
        return Err("The clip video is not H.264.".into());
    }
    if !sample_entry(moov_bytes, b"mp4a") {
        return Err("The clip audio is not AAC.".into());
    }
    let esds = find_box(moov_bytes, b"esds").ok_or("The clip is missing AAC configuration.")?;
    if !esds.windows(2).any(|pair| pair == [0x12, 0x10]) || !esds.contains(&0x40) {
        return Err("The clip audio is not AAC-LC.".into());
    }
    let mdat_begin = mdat.start + mdat.header;
    let mdat_end = mdat.start + mdat.total;
    let offsets = chunk_offsets(moov_bytes)?;
    if offsets.is_empty() {
        return Err("The clip has no samples.".into());
    }
    for offset in offsets {
        if offset < mdat_begin || offset >= mdat_end {
            return Err("A sample points outside the clip media.".into());
        }
    }
    Ok(())
}

pub fn moov_before_mdat(bytes: &[u8]) -> bool {
    let Ok(boxes) = parse_boxes(bytes) else {
        return false;
    };
    let moov = boxes.iter().position(|item| item.kind == *b"moov");
    let mdat = boxes.iter().position(|item| item.kind == *b"mdat");
    matches!((moov, mdat), (Some(moov), Some(mdat)) if moov < mdat)
}

fn ftyp() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(b"isom");
    push_u32(&mut payload, 0x200);
    payload.extend_from_slice(b"isomiso2avc1mp41");
    box_wrap(b"ftyp", &payload)
}

fn ftyp_hevc() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(b"isom");
    push_u32(&mut payload, 0x200);
    payload.extend_from_slice(b"isomiso4hvc1mp41");
    box_wrap(b"ftyp", &payload)
}

fn moov_timed(
    video: &EncodedVideo<'_>,
    duration_units: u32,
    movie_ms: u32,
    video_ms: u32,
    audio_ms: u32,
    audio_frames: u32,
) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend(mvhd(movie_ms));
    body.extend(video_trak_timed(video, duration_units, video_ms, 0));
    body.extend(audio_trak(audio_ms, audio_frames, 0));
    box_wrap(b"moov", &body)
}

fn video_trak_timed(
    video: &EncodedVideo<'_>,
    duration_units: u32,
    duration_ms: u32,
    chunk_offset: u32,
) -> Vec<u8> {
    let count = video.samples.len() as u32;
    let sizes: Vec<u32> = video
        .samples
        .iter()
        .map(|sample| sample.len() as u32)
        .collect();
    let mut sync: Vec<u32> = video
        .sync
        .iter()
        .enumerate()
        .filter(|(_, key)| **key)
        .map(|(index, _)| index as u32 + 1)
        .collect();
    if sync.is_empty() {
        sync.push(1);
    }
    let stbl = concat(&[
        stsd(video.sample_entry),
        stts_runs(video.durations),
        stss(&sync),
        stsc(count),
        stsz(&sizes),
        stco(chunk_offset),
    ]);
    let minf = concat(&[vmhd(), dinf(), box_wrap(b"stbl", &stbl)]);
    let mdia = concat(&[
        mdhd(video.timescale, duration_units),
        hdlr(b"vide", "VideoHandler"),
        box_wrap(b"minf", &minf),
    ]);
    let trak = concat(&[
        tkhd(1, duration_ms, video.width, video.height, false),
        box_wrap(b"mdia", &mdia),
    ]);
    box_wrap(b"trak", &trak)
}

fn stts_runs(durations: &[u32]) -> Vec<u8> {
    let mut runs: Vec<(u32, u32)> = Vec::new();
    for duration in durations {
        if let Some(last) = runs.last_mut() {
            if last.1 == *duration {
                last.0 = last.0.saturating_add(1);
                continue;
            }
        }
        runs.push((1, *duration));
    }
    let mut payload = Vec::new();
    push_u32(&mut payload, runs.len() as u32);
    for (count, delta) in runs {
        push_u32(&mut payload, count);
        push_u32(&mut payload, delta);
    }
    full_box(b"stts", 0, 0, &payload)
}

pub fn avc1_entry(width: u32, height: u32, sps: &[u8], pps: &[u8]) -> Vec<u8> {
    avc1(width, height, sps, pps)
}

pub fn hvc1_entry(
    width: u32,
    height: u32,
    vps: &[u8],
    sps: &[u8],
    pps: &[u8],
    level_idc: u8,
) -> Vec<u8> {
    let mut payload = visual_sample_entry(width, height, b"Lark HEVC");
    payload.extend(hvcc(vps, sps, pps, level_idc));
    box_wrap(b"hvc1", &payload)
}

fn visual_sample_entry(width: u32, height: u32, compressor: &[u8]) -> Vec<u8> {
    let mut payload = vec![0u8; 6];
    push_u16(&mut payload, 1);
    payload.extend_from_slice(&[0u8; 16]);
    push_u16(&mut payload, width as u16);
    push_u16(&mut payload, height as u16);
    push_u32(&mut payload, 0x0048_0000);
    push_u32(&mut payload, 0x0048_0000);
    push_u32(&mut payload, 0);
    push_u16(&mut payload, 1);
    let mut name = [0u8; 32];
    let text = &compressor[..compressor.len().min(31)];
    name[0] = text.len() as u8;
    name[1..1 + text.len()].copy_from_slice(text);
    payload.extend_from_slice(&name);
    push_u16(&mut payload, 0x0018);
    push_i16(&mut payload, -1);
    payload
}

fn hvcc(vps: &[u8], sps: &[u8], pps: &[u8], level_idc: u8) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.push(1);
    payload.push(1);
    payload.extend_from_slice(&0x4000_0000u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 6]);
    payload.push(level_idc);
    payload.extend_from_slice(&0xF000u16.to_be_bytes());
    payload.push(0xFC);
    payload.push(0xFD);
    payload.push(0xF8);
    payload.push(0xF8);
    payload.extend_from_slice(&0u16.to_be_bytes());
    payload.push(0x0F);
    payload.push(3);
    push_nal_array(&mut payload, 32, vps);
    push_nal_array(&mut payload, 33, sps);
    push_nal_array(&mut payload, 34, pps);
    box_wrap(b"hvcC", &payload)
}

fn push_nal_array(out: &mut Vec<u8>, nal_type: u8, nal: &[u8]) {
    out.push(0x80 | (nal_type & 0x3f));
    push_u16(out, 1);
    push_u16(out, nal.len() as u16);
    out.extend_from_slice(nal);
}

fn moov(
    video: &VideoTrack<'_>,
    movie_ms: u32,
    video_ms: u32,
    audio_ms: u32,
    audio_frames: u32,
    video_offset: u32,
    audio_offset: u32,
) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend(mvhd(movie_ms));
    body.extend(video_trak(video, video_ms, video_offset));
    body.extend(audio_trak(audio_ms, audio_frames, audio_offset));
    box_wrap(b"moov", &body)
}

fn video_trak(video: &VideoTrack<'_>, duration_ms: u32, chunk_offset: u32) -> Vec<u8> {
    let count = video.samples.len() as u32;
    let sizes: Vec<u32> = video
        .samples
        .iter()
        .map(|sample| sample.len() as u32)
        .collect();
    let mut sync: Vec<u32> = video
        .sync
        .iter()
        .enumerate()
        .filter(|(_, key)| **key)
        .map(|(index, _)| index as u32 + 1)
        .collect();
    if sync.is_empty() {
        sync.push(1);
    }
    let stbl = concat(&[
        stsd(&avc1(video.width, video.height, video.sps, video.pps)),
        stts(count, 1),
        stss(&sync),
        stsc(count),
        stsz(&sizes),
        stco(chunk_offset),
    ]);
    let minf = concat(&[vmhd(), dinf(), box_wrap(b"stbl", &stbl)]);
    let mdia = concat(&[
        mdhd(video.fps, count),
        hdlr(b"vide", "VideoHandler"),
        box_wrap(b"minf", &minf),
    ]);
    let trak = concat(&[
        tkhd(1, duration_ms, video.width, video.height, false),
        box_wrap(b"mdia", &mdia),
    ]);
    box_wrap(b"trak", &trak)
}

fn audio_trak(duration_ms: u32, frames: u32, chunk_offset: u32) -> Vec<u8> {
    let sizes = vec![SILENT_AAC.len() as u32; frames as usize];
    let stbl = concat(&[
        stsd(&mp4a()),
        stts(frames, AAC_FRAME_SAMPLES),
        stsc(frames),
        stsz(&sizes),
        stco(chunk_offset),
    ]);
    let minf = concat(&[smhd(), dinf(), box_wrap(b"stbl", &stbl)]);
    let media_duration = frames * AAC_FRAME_SAMPLES;
    let mdia = concat(&[
        mdhd(AAC_SAMPLE_RATE, media_duration),
        hdlr(b"soun", "SoundHandler"),
        box_wrap(b"minf", &minf),
    ]);
    let trak = concat(&[tkhd(2, duration_ms, 0, 0, true), box_wrap(b"mdia", &mdia)]);
    box_wrap(b"trak", &trak)
}

fn mvhd(duration: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, 0);
    push_u32(&mut payload, 0);
    push_u32(&mut payload, 1000);
    push_u32(&mut payload, duration);
    push_u32(&mut payload, 0x0001_0000);
    push_u16(&mut payload, 0x0100);
    push_u16(&mut payload, 0);
    push_u32(&mut payload, 0);
    push_u32(&mut payload, 0);
    push_matrix(&mut payload);
    for _ in 0..6 {
        push_u32(&mut payload, 0);
    }
    push_u32(&mut payload, 3);
    full_box(b"mvhd", 0, 0, &payload)
}

fn tkhd(track_id: u32, duration: u32, width: u32, height: u32, audio: bool) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, 0);
    push_u32(&mut payload, 0);
    push_u32(&mut payload, track_id);
    push_u32(&mut payload, 0);
    push_u32(&mut payload, duration);
    push_u32(&mut payload, 0);
    push_u32(&mut payload, 0);
    push_u16(&mut payload, 0);
    push_u16(&mut payload, 0);
    push_u16(&mut payload, if audio { 0x0100 } else { 0 });
    push_u16(&mut payload, 0);
    push_matrix(&mut payload);
    push_u32(&mut payload, width << 16);
    push_u32(&mut payload, height << 16);
    full_box(b"tkhd", 0, 3, &payload)
}

fn mdhd(timescale: u32, duration: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, 0);
    push_u32(&mut payload, 0);
    push_u32(&mut payload, timescale);
    push_u32(&mut payload, duration);
    push_u16(&mut payload, 0x55c4);
    push_u16(&mut payload, 0);
    full_box(b"mdhd", 0, 0, &payload)
}

fn hdlr(kind: &[u8; 4], name: &str) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, 0);
    payload.extend_from_slice(kind);
    payload.extend_from_slice(&[0; 12]);
    payload.extend_from_slice(name.as_bytes());
    payload.push(0);
    full_box(b"hdlr", 0, 0, &payload)
}

fn vmhd() -> Vec<u8> {
    full_box(b"vmhd", 0, 1, &[0; 8])
}

fn smhd() -> Vec<u8> {
    full_box(b"smhd", 0, 0, &[0; 4])
}

fn dinf() -> Vec<u8> {
    let url = full_box(b"url ", 0, 1, &[]);
    let mut entries = Vec::new();
    push_u32(&mut entries, 1);
    entries.extend_from_slice(&url);
    box_wrap(b"dinf", &full_box(b"dref", 0, 0, &entries))
}

fn stsd(entry: &[u8]) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, 1);
    payload.extend_from_slice(entry);
    full_box(b"stsd", 0, 0, &payload)
}

fn stts(count: u32, delta: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, 1);
    push_u32(&mut payload, count);
    push_u32(&mut payload, delta);
    full_box(b"stts", 0, 0, &payload)
}

fn stss(samples: &[u32]) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, samples.len() as u32);
    for sample in samples {
        push_u32(&mut payload, *sample);
    }
    full_box(b"stss", 0, 0, &payload)
}

fn stsc(samples: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, 1);
    push_u32(&mut payload, 1);
    push_u32(&mut payload, samples);
    push_u32(&mut payload, 1);
    full_box(b"stsc", 0, 0, &payload)
}

fn stsz(sizes: &[u32]) -> Vec<u8> {
    let mut payload = Vec::new();
    let constant = sizes.first().copied().unwrap_or(0);
    if !sizes.is_empty() && sizes.iter().all(|size| *size == constant) {
        push_u32(&mut payload, constant);
        push_u32(&mut payload, sizes.len() as u32);
    } else {
        push_u32(&mut payload, 0);
        push_u32(&mut payload, sizes.len() as u32);
        for size in sizes {
            push_u32(&mut payload, *size);
        }
    }
    full_box(b"stsz", 0, 0, &payload)
}

fn stco(offset: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    push_u32(&mut payload, 1);
    push_u32(&mut payload, offset);
    full_box(b"stco", 0, 0, &payload)
}

fn avc1(width: u32, height: u32, sps: &[u8], pps: &[u8]) -> Vec<u8> {
    let mut payload = vec![0u8; 6];
    push_u16(&mut payload, 1);
    payload.extend_from_slice(&[0u8; 16]);
    push_u16(&mut payload, width as u16);
    push_u16(&mut payload, height as u16);
    push_u32(&mut payload, 0x0048_0000);
    push_u32(&mut payload, 0x0048_0000);
    push_u32(&mut payload, 0);
    push_u16(&mut payload, 1);
    let mut name = [0u8; 32];
    let text = b"Lark H264";
    name[0] = text.len() as u8;
    name[1..1 + text.len()].copy_from_slice(text);
    payload.extend_from_slice(&name);
    push_u16(&mut payload, 0x0018);
    push_i16(&mut payload, -1);
    payload.extend(avcc(sps, pps));
    box_wrap(b"avc1", &payload)
}

fn avcc(sps: &[u8], pps: &[u8]) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.push(1);
    payload.push(sps[1]);
    payload.push(sps[2]);
    payload.push(sps[3]);
    payload.push(0xff);
    payload.push(0xe1);
    push_u16(&mut payload, sps.len() as u16);
    payload.extend_from_slice(sps);
    payload.push(1);
    push_u16(&mut payload, pps.len() as u16);
    payload.extend_from_slice(pps);
    box_wrap(b"avcC", &payload)
}

fn mp4a() -> Vec<u8> {
    let mut payload = vec![0u8; 6];
    push_u16(&mut payload, 1);
    push_u16(&mut payload, 0);
    push_u16(&mut payload, 0);
    push_u32(&mut payload, 0);
    push_u16(&mut payload, 2);
    push_u16(&mut payload, 16);
    push_u16(&mut payload, 0);
    push_u16(&mut payload, 0);
    push_u32(&mut payload, AAC_SAMPLE_RATE << 16);
    payload.extend(esds());
    box_wrap(b"mp4a", &payload)
}

fn esds() -> Vec<u8> {
    let specific = [0x05u8, 2, 0x12, 0x10];
    let mut decoder = vec![0x04, 0, 0x40, 0x15, 0, 0, 0];
    decoder.extend_from_slice(&4_000u32.to_be_bytes());
    decoder.extend_from_slice(&2_067u32.to_be_bytes());
    decoder.extend_from_slice(&specific);
    decoder[1] = (decoder.len() - 2) as u8;
    let mut descriptor = vec![0x03, 0, 0x00, 0x02, 0x00];
    descriptor.extend_from_slice(&decoder);
    descriptor.extend_from_slice(&[0x06, 0x01, 0x02]);
    descriptor[1] = (descriptor.len() - 2) as u8;
    full_box(b"esds", 0, 0, &descriptor)
}

fn full_box(kind: &[u8; 4], version: u8, flags: u32, payload: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(4 + payload.len());
    body.push(version);
    body.push((flags >> 16) as u8);
    body.push((flags >> 8) as u8);
    body.push(flags as u8);
    body.extend_from_slice(payload);
    box_wrap(kind, &body)
}

fn box_wrap(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + payload.len());
    push_u32(&mut out, (8 + payload.len()) as u32);
    out.extend_from_slice(kind);
    out.extend_from_slice(payload);
    out
}

fn concat(parts: &[Vec<u8>]) -> Vec<u8> {
    let mut out = Vec::new();
    for part in parts {
        out.extend_from_slice(part);
    }
    out
}

fn push_matrix(out: &mut Vec<u8>) {
    for value in [0x0001_0000u32, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000] {
        push_u32(out, value);
    }
}

fn push_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_be_bytes());
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_be_bytes());
}

fn push_i16(out: &mut Vec<u8>, value: i16) {
    out.extend_from_slice(&value.to_be_bytes());
}

struct Mp4Box {
    kind: [u8; 4],
    start: usize,
    total: usize,
    header: usize,
}

impl Mp4Box {
    fn range(&self) -> std::ops::Range<usize> {
        self.start..self.start + self.total
    }
}

fn parse_boxes(input: &[u8]) -> Result<Vec<Mp4Box>, String> {
    let mut boxes = Vec::new();
    let mut cursor = 0usize;
    while cursor + 8 <= input.len() {
        let size32 = u32::from_be_bytes(input[cursor..cursor + 4].try_into().unwrap());
        let kind = input[cursor + 4..cursor + 8].try_into().unwrap();
        let (total, header) = if size32 == 1 {
            if cursor + 16 > input.len() {
                return Err("The clip header is truncated.".into());
            }
            let size = u64::from_be_bytes(input[cursor + 8..cursor + 16].try_into().unwrap());
            (size as usize, 16)
        } else if size32 == 0 {
            (input.len() - cursor, 8)
        } else {
            (size32 as usize, 8)
        };
        if total < header || cursor + total > input.len() {
            return Err("The clip header is truncated.".into());
        }
        boxes.push(Mp4Box {
            kind,
            start: cursor,
            total,
            header,
        });
        cursor += total;
    }
    Ok(boxes)
}

fn container(kind: &[u8]) -> bool {
    matches!(
        kind,
        b"moov" | b"trak" | b"mdia" | b"minf" | b"stbl" | b"edts" | b"dinf"
    )
}

fn assign_chunk_offsets(moov: &mut [u8], offsets: &[u32]) -> Result<(), String> {
    let mut index = 0usize;
    assign_offsets(moov, offsets, &mut index)?;
    if index != offsets.len() {
        return Err("The clip is missing chunk offsets.".into());
    }
    Ok(())
}

fn assign_offsets(data: &mut [u8], offsets: &[u32], index: &mut usize) -> Result<(), String> {
    let mut cursor = 0usize;
    while cursor + 8 <= data.len() {
        let total = u32::from_be_bytes(data[cursor..cursor + 4].try_into().unwrap()) as usize;
        if total < 8 || cursor + total > data.len() {
            return Err("The clip header is truncated.".into());
        }
        let kind = data[cursor + 4..cursor + 8].to_vec();
        if kind == b"stco" {
            let offset = *offsets.get(*index).ok_or("Too many chunk offset boxes.")?;
            *index += 1;
            if data[cursor..cursor + total].len() < 20 {
                return Err("The clip chunk offset is truncated.".into());
            }
            data[cursor + 16..cursor + 20].copy_from_slice(&offset.to_be_bytes());
        } else if container(&kind) {
            assign_offsets(&mut data[cursor + 8..cursor + total], offsets, index)?;
        }
        cursor += total;
    }
    Ok(())
}

fn shift_chunk_offsets(moov: &mut [u8], delta: i64) -> Result<(), String> {
    let mut cursor = 0usize;
    while cursor + 8 <= moov.len() {
        let total = u32::from_be_bytes(moov[cursor..cursor + 4].try_into().unwrap()) as usize;
        if total < 8 || cursor + total > moov.len() {
            return Err("The clip header is truncated.".into());
        }
        let kind = moov[cursor + 4..cursor + 8].to_vec();
        if kind == b"stco" {
            shift_stco(&mut moov[cursor..cursor + total], delta)?;
        } else if kind == b"co64" {
            shift_co64(&mut moov[cursor..cursor + total], delta)?;
        } else if container(&kind) {
            shift_chunk_offsets(&mut moov[cursor + 8..cursor + total], delta)?;
        }
        cursor += total;
    }
    Ok(())
}

fn shift_stco(data: &mut [u8], delta: i64) -> Result<(), String> {
    if data.len() < 16 {
        return Err("The clip chunk offset is truncated.".into());
    }
    let count = u32::from_be_bytes(data[12..16].try_into().unwrap()) as usize;
    if data.len() < 16 + count * 4 {
        return Err("The clip chunk offset is truncated.".into());
    }
    for index in 0..count {
        let at = 16 + index * 4;
        let old = u32::from_be_bytes(data[at..at + 4].try_into().unwrap()) as i64;
        let new = old + delta;
        if !(0..=u32::MAX as i64).contains(&new) {
            return Err("The clip offset does not fit.".into());
        }
        data[at..at + 4].copy_from_slice(&(new as u32).to_be_bytes());
    }
    Ok(())
}

fn shift_co64(data: &mut [u8], delta: i64) -> Result<(), String> {
    if data.len() < 16 {
        return Err("The clip chunk offset is truncated.".into());
    }
    let count = u32::from_be_bytes(data[12..16].try_into().unwrap()) as usize;
    if data.len() < 16 + count * 8 {
        return Err("The clip chunk offset is truncated.".into());
    }
    for index in 0..count {
        let at = 16 + index * 8;
        let old = i64::from_be_bytes(data[at..at + 8].try_into().unwrap());
        let new = old
            .checked_add(delta)
            .ok_or("The clip offset does not fit.")?;
        if new < 0 {
            return Err("The clip offset does not fit.".into());
        }
        data[at..at + 8].copy_from_slice(&(new as u64).to_be_bytes());
    }
    Ok(())
}

fn chunk_offsets(moov: &[u8]) -> Result<Vec<usize>, String> {
    let mut offsets = Vec::new();
    collect_offsets(moov, &mut offsets)?;
    Ok(offsets)
}

fn collect_offsets(data: &[u8], offsets: &mut Vec<usize>) -> Result<(), String> {
    let mut cursor = 0usize;
    while cursor + 8 <= data.len() {
        let total = u32::from_be_bytes(data[cursor..cursor + 4].try_into().unwrap()) as usize;
        if total < 8 || cursor + total > data.len() {
            return Err("The clip header is truncated.".into());
        }
        let kind = &data[cursor + 4..cursor + 8];
        if kind == b"stco" {
            let count =
                u32::from_be_bytes(data[cursor + 12..cursor + 16].try_into().unwrap()) as usize;
            for index in 0..count {
                let at = cursor + 16 + index * 4;
                offsets.push(u32::from_be_bytes(data[at..at + 4].try_into().unwrap()) as usize);
            }
        } else if kind == b"co64" {
            let count =
                u32::from_be_bytes(data[cursor + 12..cursor + 16].try_into().unwrap()) as usize;
            for index in 0..count {
                let at = cursor + 16 + index * 8;
                offsets.push(u64::from_be_bytes(data[at..at + 8].try_into().unwrap()) as usize);
            }
        } else if container(kind) {
            collect_offsets(&data[cursor + 8..cursor + total], offsets)?;
        }
        cursor += total;
    }
    Ok(())
}

fn sample_entry(moov: &[u8], kind: &[u8; 4]) -> bool {
    find_entries(moov, kind)
}

fn find_entries(data: &[u8], kind: &[u8; 4]) -> bool {
    let mut cursor = 0usize;
    while cursor + 8 <= data.len() {
        let total = u32::from_be_bytes(data[cursor..cursor + 4].try_into().unwrap()) as usize;
        if total < 8 || cursor + total > data.len() {
            return false;
        }
        let box_kind = &data[cursor + 4..cursor + 8];
        if box_kind == b"stsd" && cursor + 16 <= data.len() {
            let mut entry = cursor + 16;
            let end = cursor + total;
            while entry + 8 <= end {
                let entry_size =
                    u32::from_be_bytes(data[entry..entry + 4].try_into().unwrap()) as usize;
                if entry_size < 8 || entry + entry_size > end {
                    break;
                }
                if &data[entry + 4..entry + 8] == kind {
                    return true;
                }
                entry += entry_size;
            }
        } else if container(box_kind) && find_entries(&data[cursor + 8..cursor + total], kind) {
            return true;
        }
        cursor += total;
    }
    false
}

fn find_box<'a>(data: &'a [u8], kind: &[u8; 4]) -> Option<&'a [u8]> {
    let mut cursor = 0usize;
    while cursor + 8 <= data.len() {
        let total = u32::from_be_bytes(data[cursor..cursor + 4].try_into().unwrap()) as usize;
        if total < 8 || cursor + total > data.len() {
            return None;
        }
        let box_kind = &data[cursor + 4..cursor + 8];
        if box_kind == kind {
            return Some(&data[cursor..cursor + total]);
        }
        if container(box_kind) {
            if let Some(found) = find_box(&data[cursor + 8..cursor + total], kind) {
                return Some(found);
            }
        } else if box_kind == b"stsd"
            || box_kind == b"avc1"
            || box_kind == b"hvc1"
            || box_kind == b"mp4a"
        {
            let child_at = if box_kind == b"stsd" {
                16
            } else if box_kind == b"avc1" || box_kind == b"hvc1" {
                86
            } else {
                36
            };
            if cursor + child_at < cursor + total {
                if let Some(found) = find_box(&data[cursor + child_at..cursor + total], kind) {
                    return Some(found);
                }
            }
        }
        cursor += total;
    }
    None
}

/// Used by the faststart test to build the moov-at-end layout hardware encoders sometimes write.
#[cfg(test)]
fn place_moov_after_mdat(input: &[u8]) -> Result<Vec<u8>, String> {
    let boxes = parse_boxes(input)?;
    let moov_at = boxes
        .iter()
        .position(|item| item.kind == *b"moov")
        .ok_or("missing moov")?;
    let mdat_at = boxes
        .iter()
        .position(|item| item.kind == *b"mdat")
        .ok_or("missing mdat")?;
    let mut order = Vec::new();
    for (index, _) in boxes.iter().enumerate() {
        if index == moov_at {
            continue;
        }
        order.push(index);
        if index == mdat_at {
            order.push(moov_at);
        }
    }
    let mut cursor = 0usize;
    let mut new_mdat_data = 0usize;
    for index in &order {
        if *index == mdat_at {
            new_mdat_data = cursor + boxes[*index].header;
        }
        cursor += boxes[*index].total;
    }
    let old_mdat_data = boxes[mdat_at].start + boxes[mdat_at].header;
    let delta = new_mdat_data as i64 - old_mdat_data as i64;
    let mut moov = input[boxes[moov_at].range()].to_vec();
    shift_chunk_offsets(&mut moov, delta)?;
    let mut out = Vec::with_capacity(input.len());
    for index in order {
        if index == moov_at {
            out.extend_from_slice(&moov);
        } else {
            out.extend_from_slice(&input[boxes[index].range()]);
        }
    }
    Ok(out)
}

pub fn ffmpeg_video_encoders(os: &str) -> &'static [&'static str] {
    match os {
        "windows" => &["h264_mf", "h264_nvenc", "h264_qsv", "h264_amf", "libx264"],
        "macos" => &["h264_videotoolbox", "libx264"],
        _ => &["libx264"],
    }
}

pub fn bundled_ffmpeg() -> Option<std::path::PathBuf> {
    if let Some(path) = std::env::var_os("LARK_FFMPEG") {
        let path = std::path::PathBuf::from(path);
        if path.is_file() {
            return Some(path);
        }
    }
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    for name in ["ffmpeg", "ffmpeg.exe"] {
        let beside = dir.join(name);
        if beside.is_file() {
            return Some(beside);
        }
        let nested = dir.join("binaries").join(name);
        if nested.is_file() {
            return Some(nested);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_track() -> (Vec<u8>, Vec<u8>, Vec<Vec<u8>>, Vec<bool>) {
        let sps = vec![0x67, 0x42, 0xc0, 0x0a, 0xff, 0xe1];
        let pps = vec![0x68, 0xce, 0x06, 0xe2];
        let sample = {
            let nal = [0x65u8, 0x88, 0x84, 0x00];
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&(nal.len() as u32).to_be_bytes());
            bytes.extend_from_slice(&nal);
            bytes
        };
        (sps, pps, vec![sample], vec![true])
    }

    #[test]
    fn mux_writes_h264_aac_with_moov_before_media() {
        let (sps, pps, samples, sync) = tiny_track();
        let bytes = mux_h264_aac(&VideoTrack {
            width: 16,
            height: 16,
            fps: 5,
            sps: &sps,
            pps: &pps,
            samples: &samples,
            sync: &sync,
        })
        .unwrap();
        require_discord_mp4(&bytes).unwrap();
        assert!(moov_before_mdat(&bytes));
        assert_eq!(&bytes[4..8], b"ftyp");
        let moov = bytes.windows(4).position(|tag| tag == b"moov").unwrap();
        let mdat = bytes.windows(4).position(|tag| tag == b"mdat").unwrap();
        assert!(moov < mdat);
    }

    #[test]
    fn faststart_moves_moov_ahead_of_mdat_and_keeps_offsets_inside_media() {
        let (sps, pps, samples, sync) = tiny_track();
        let fast = mux_h264_aac(&VideoTrack {
            width: 16,
            height: 16,
            fps: 5,
            sps: &sps,
            pps: &pps,
            samples: &samples,
            sync: &sync,
        })
        .unwrap();
        let delayed = place_moov_after_mdat(&fast).unwrap();
        assert!(!moov_before_mdat(&delayed));
        let restored = ensure_faststart(&delayed).unwrap();
        assert!(moov_before_mdat(&restored));
        require_discord_mp4(&restored).unwrap();
        assert_eq!(ensure_faststart(&restored).unwrap(), restored);
    }

    #[test]
    fn encoder_order_prefers_platform_hardware() {
        assert_eq!(ffmpeg_video_encoders("windows")[0], "h264_mf");
        assert_eq!(ffmpeg_video_encoders("macos")[0], "h264_videotoolbox");
        assert_eq!(ffmpeg_video_encoders("linux"), &["libx264"]);
    }
}
