import { registerPlugin } from '@capacitor/core';

export interface BiometricAvailabilityResult {
  isAvailable: boolean;
  hasEnrolledBiometrics: boolean;
  biometricType: 'fingerprint' | 'face' | 'iris' | 'unknown';
  status:
    | 'SUCCESS'
    | 'NONE_ENROLLED'
    | 'NO_HARDWARE'
    | 'HW_UNAVAILABLE'
    | 'SECURITY_UPDATE_REQUIRED'
    | 'UNSUPPORTED';
  message: string;
}

export interface BiometricAuthenticateOptions {
  title?: string;
  subtitle?: string;
  description?: string;
  negativeButtonText?: string;
}

export interface BiometricAuthenticateResult {
  verified: boolean;
  biometricType: string;
  timestamp: number;
  message: string;
}

export interface BiometricAuthPluginInterface {
  checkBiometricAvailability(): Promise<BiometricAvailabilityResult>;
  authenticate(options?: BiometricAuthenticateOptions): Promise<BiometricAuthenticateResult>;
}

const BiometricAuth = registerPlugin<BiometricAuthPluginInterface>('BiometricAuth');

export default BiometricAuth;
