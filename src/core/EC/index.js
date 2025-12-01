// Public API for EC (Error Correction) module
export {
    GenericGF,
    GenericGFPoly,
    GenericGF_AZTEC_DATA_12,
    GenericGF_AZTEC_DATA_10,
    GenericGF_AZTEC_DATA_6,
    GenericGF_AZTEC_PARAM,
    GenericGF_QR_CODE_FIELD_256,
    GenericGF_DATA_MATRIX_FIELD_256,
    GenericGF_AZTEC_DATA_8,
    GenericGF_MAXICODE_FIELD_64
} from './galois-field.js';

export { ReedSolomonEncoder, ReedSolomonDecoder } from './reed-solomon.js';
