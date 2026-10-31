package cd.etsamani.app.plugins;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {

    @PluginMethod
    public void checkBiometricAvailability(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Contexte Android indisponible");
            return;
        }

        BiometricManager biometricManager = BiometricManager.from(context);
        int canAuth = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK
        );

        JSObject result = new JSObject();
        result.put("biometricType", "fingerprint");

        switch (canAuth) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                result.put("isAvailable", true);
                result.put("hasEnrolledBiometrics", true);
                result.put("status", "SUCCESS");
                result.put("message", "Capteur d'empreinte opérationnel et empreinte enregistrée sur le téléphone.");
                break;

            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                result.put("isAvailable", true);
                result.put("hasEnrolledBiometrics", false);
                result.put("status", "NONE_ENROLLED");
                result.put("message", "Aucune empreinte digitale n'est enregistrée sur ce téléphone. Veuillez l'enregistrer dans les paramètres Android de l'appareil.");
                break;

            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                result.put("isAvailable", false);
                result.put("hasEnrolledBiometrics", false);
                result.put("status", "NO_HARDWARE");
                result.put("message", "Ce téléphone ne dispose pas d'un capteur biométrique matériel.");
                break;

            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                result.put("isAvailable", false);
                result.put("hasEnrolledBiometrics", false);
                result.put("status", "HW_UNAVAILABLE");
                result.put("message", "Le capteur d'empreinte est actuellement indisponible ou occupé.");
                break;

            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                result.put("isAvailable", false);
                result.put("hasEnrolledBiometrics", false);
                result.put("status", "SECURITY_UPDATE_REQUIRED");
                result.put("message", "Mise à jour de sécurité Android requise pour activer la biométrie.");
                break;

            default:
                result.put("isAvailable", false);
                result.put("hasEnrolledBiometrics", false);
                result.put("status", "UNSUPPORTED");
                result.put("message", "Authentification biométrique non supportée sur cet appareil.");
                break;
        }

        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) {
            call.reject("Activité Android parente introuvable", "ACTIVITY_UNAVAILABLE");
            return;
        }

        Context context = getContext();
        BiometricManager biometricManager = BiometricManager.from(context);
        int canAuth = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK
        );

        if (canAuth == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            call.reject(
                "Aucune empreinte digitale n'est enregistrée sur ce téléphone. Veuillez d'abord enregistrer l'empreinte de l'agent dans les paramètres de sécurité Android de l'appareil.",
                "NONE_ENROLLED"
            );
            return;
        } else if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("Capteur biométrique indisponible sur ce téléphone", "HW_UNAVAILABLE");
            return;
        }

        String title = call.getString("title", "Ets AMANI — Authentification Biométrique");
        String subtitle = call.getString("subtitle", "Vérification d'identité de l'agent");
        String description = call.getString("description", "Posez votre empreinte digitale enregistrée sur le capteur du téléphone afin d'accéder à la plateforme.");
        String negativeButtonText = call.getString("negativeButtonText", "Annuler");

        activity.runOnUiThread(() -> {
            try {
                Executor executor = ContextCompat.getMainExecutor(context);

                BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setDescription(description)
                    .setNegativeButtonText(negativeButtonText)
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK
                    )
                    .build();

                BiometricPrompt biometricPrompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        super.onAuthenticationError(errorCode, errString);
                        String codeStr;
                        if (errorCode == BiometricPrompt.ERROR_USER_CANCELED || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                            codeStr = "USER_CANCELED";
                        } else if (errorCode == BiometricPrompt.ERROR_LOCKOUT || errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
                            codeStr = "LOCKOUT";
                        } else {
                            codeStr = "AUTH_ERROR_" + errorCode;
                        }
                        call.reject(errString.toString(), codeStr);
                    }

                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);
                        JSObject ret = new JSObject();
                        ret.put("verified", true);
                        ret.put("biometricType", "fingerprint");
                        ret.put("timestamp", System.currentTimeMillis());
                        ret.put("message", "Empreinte reconnue et validée par le système Android.");
                        call.resolve(ret);
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        super.onAuthenticationFailed();
                    }
                });

                biometricPrompt.authenticate(promptInfo);
            } catch (Exception e) {
                call.reject("Erreur lors du déclenchement du capteur d'empreinte : " + e.getMessage(), "EXCEPTION");
            }
        });
    }
}
