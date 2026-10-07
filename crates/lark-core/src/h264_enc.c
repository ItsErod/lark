/* Public-domain H.264 encoder (https://github.com/lieff/minih264, CC0).
   One thread, no SVC. The desktop shell prefers a hardware encoder and only
   falls back here so a clip can still be saved while a game is in front. */

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define H264E_MAX_THREADS 0
#define H264E_SVC_API 0
#define MINIH264_IMPLEMENTATION
#include "minih264e.h"

typedef struct LarkH264 {
    H264E_persist_t *enc;
    H264E_scratch_t *scratch;
    int width;
    int height;
} LarkH264;

int lark_h264_open(LarkH264 **out, int width, int height, int gop) {
    H264E_create_param_t par;
    int persist = 0;
    int scratch = 0;
    LarkH264 *encoder;

    if (!out || width < 16 || height < 16 || (width & 15) || (height & 15)) {
        return 1;
    }
    memset(&par, 0, sizeof(par));
    par.width = width;
    par.height = height;
    par.gop = gop > 0 ? gop : 1;
    par.const_input_flag = 1;
    par.enableNEON = 1;
    if (H264E_sizeof(&par, &persist, &scratch) != H264E_STATUS_SUCCESS || persist <= 0 || scratch <= 0) {
        return 2;
    }
    encoder = (LarkH264 *)calloc(1, sizeof(*encoder));
    if (!encoder) {
        return 3;
    }
    encoder->enc = (H264E_persist_t *)calloc(1, (size_t)persist);
    encoder->scratch = (H264E_scratch_t *)calloc(1, (size_t)scratch);
    encoder->width = width;
    encoder->height = height;
    if (!encoder->enc || !encoder->scratch || H264E_init(encoder->enc, &par) != H264E_STATUS_SUCCESS) {
        free(encoder->enc);
        free(encoder->scratch);
        free(encoder);
        return 4;
    }
    *out = encoder;
    return 0;
}

int lark_h264_encode(
    LarkH264 *encoder,
    uint8_t *y,
    uint8_t *u,
    uint8_t *v,
    int y_stride,
    int c_stride,
    int speed,
    int frame_bytes,
    int qp_min,
    int qp_max,
    uint8_t **data,
    int *size
) {
    H264E_io_yuv_t yuv;
    H264E_run_param_t run;

    if (!encoder || !y || !u || !v || !data || !size) {
        return 1;
    }
    yuv.yuv[0] = y;
    yuv.yuv[1] = u;
    yuv.yuv[2] = v;
    yuv.stride[0] = y_stride;
    yuv.stride[1] = c_stride;
    yuv.stride[2] = c_stride;
    memset(&run, 0, sizeof(run));
    run.encode_speed = speed;
    run.frame_type = H264E_FRAME_TYPE_DEFAULT;
    run.desired_frame_bytes = frame_bytes;
    run.qp_min = qp_min;
    run.qp_max = qp_max;
    return H264E_encode(encoder->enc, encoder->scratch, &run, &yuv, data, size);
}

void lark_h264_close(LarkH264 *encoder) {
    if (!encoder) {
        return;
    }
    free(encoder->enc);
    free(encoder->scratch);
    free(encoder);
}
