import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { randomBytes } from 'node:crypto';

const seed = randomBytes(32);
const { secretKey, publicKey } = ml_dsa65.keygen(seed);
console.log('ML_DSA_PRIVATE_KEY=' + Buffer.from(secretKey).toString('hex'));
console.log('ML_DSA_PUBLIC_KEY='  + Buffer.from(publicKey).toString('hex'));
