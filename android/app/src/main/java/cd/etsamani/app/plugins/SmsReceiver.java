package cd.etsamani.app.plugins;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "EtsAmaniSmsReceiver";
    private static final String PREFS_NAME = "EtsAmaniSmsReader";
    private static final String KEY_PENDING_SMS = "pending_sms";
    private static final String KEY_CONFIGURED_PHONE = "configured_receiver_phone";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) {
            return;
        }

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null || pdus.length == 0) {
            return;
        }

        String format = bundle.getString("format");
        int subscriptionId = bundle.getInt(
            SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX,
            SubscriptionManager.INVALID_SUBSCRIPTION_ID
        );

        Log.d(TAG, "SMS Broadcast reçu | subscriptionId=" + subscriptionId);

        // Grouper les parties de messages longs (SMS concaténés / multi-part) par expéditeur
        Map<String, StringBuilder> bodyMap = new HashMap<>();
        Map<String, Long> timestampMap = new HashMap<>();

        for (Object pdu : pdus) {
            SmsMessage sms;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                sms = SmsMessage.createFromPdu((byte[]) pdu, format);
            } else {
                sms = SmsMessage.createFromPdu((byte[]) pdu);
            }

            if (sms == null) {
                continue;
            }

            String sender = sms.getOriginatingAddress();
            if (sender == null) {
                sender = "INCONNU";
            }
            String bodyPart = sms.getMessageBody();
            long timestamp = sms.getTimestampMillis();

            if (!bodyMap.containsKey(sender)) {
                bodyMap.put(sender, new StringBuilder());
                timestampMap.put(sender, timestamp > 0 ? timestamp : System.currentTimeMillis());
            }

            if (bodyPart != null) {
                bodyMap.get(sender).append(bodyPart);
            }
        }

        // Résolution du numéro interne destinataire pour cet appareil collecteur
        String receiverPhoneNumber = resolveReceiverPhoneNumber(context, subscriptionId);

        for (Map.Entry<String, StringBuilder> entry : bodyMap.entrySet()) {
            String sender = entry.getKey();
            String fullMessage = entry.getValue().toString();
            long timestamp = timestampMap.containsKey(sender) ? timestampMap.get(sender) : System.currentTimeMillis();

            Log.d(TAG, "SMS traité | sender=" + sender + " | receiver=" + receiverPhoneNumber + " | len=" + fullMessage.length());

            // 1. Sauvegarder dans la file d'attente persistante locale (SharedPreferences) pour robustesse Offline & redémarrage
            savePendingSms(context, sender, fullMessage, timestamp, subscriptionId, receiverPhoneNumber);

            // 2. Si le plugin Capacitor est actif en mémoire (application ouverte au premier plan), notifier immédiatement
            SmsReaderPlugin activePlugin = SmsReaderPlugin.getInstance();
            if (activePlugin != null) {
                try {
                    activePlugin.notifySmsReceived(sender, fullMessage, timestamp, subscriptionId, receiverPhoneNumber);
                } catch (Exception e) {
                    Log.w(TAG, "Notification en direct au plugin échouée, le SMS sera lu via getPendingSms() : " + e.getMessage());
                }
            }
        }
    }

    /**
     * Résout le numéro de téléphone de la SIM source ou se replie sur la configuration
     * explicite de l'appareil collecteur enregistrée dans l'application Ets AMANI.
     */
    private String resolveReceiverPhoneNumber(Context context, int subscriptionId) {
        String receiverPhone = "";

        // A. Tentative via SubscriptionManager Android (si permissions accordées)
        if (subscriptionId != SubscriptionManager.INVALID_SUBSCRIPTION_ID && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                SubscriptionManager sm = (SubscriptionManager) context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
                if (sm != null) {
                    SubscriptionInfo info = sm.getActiveSubscriptionInfo(subscriptionId);
                    if (info != null && info.getNumber() != null && !info.getNumber().trim().isEmpty()) {
                        receiverPhone = info.getNumber().trim();
                    }
                }
            } catch (SecurityException e) {
                Log.d(TAG, "Lecture permission READ_PHONE_NUMBERS non disponible dans le receiver.");
            } catch (Exception e) {
                Log.w(TAG, "Impossible d'interroger SubscriptionInfo : " + e.getMessage());
            }
        }

        // B. Repli sur le numéro interne explicitement associé à cette SIM ou à ce terminal collecteur
        if (receiverPhone.isEmpty()) {
            try {
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                if (subscriptionId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                    String subPhone = prefs.getString("sub_" + subscriptionId + "_phone", "");
                    if (subPhone != null && !subPhone.trim().isEmpty()) {
                        receiverPhone = subPhone.trim();
                    }
                }
                if (receiverPhone.isEmpty()) {
                    String configuredPhone = prefs.getString(KEY_CONFIGURED_PHONE, "");
                    if (configuredPhone != null && !configuredPhone.trim().isEmpty()) {
                        receiverPhone = configuredPhone.trim();
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Erreur lecture préférences collecteur", e);
            }
        }

        return receiverPhone;
    }

    private void savePendingSms(
        Context context,
        String sender,
        String message,
        long timestamp,
        int subscriptionId,
        String receiverPhoneNumber
    ) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString(KEY_PENDING_SMS, "[]");
            JSONArray smsArray = new JSONArray(existing);

            // Déduplication locale dans la file SharedPreferences pour éviter de réinsérer le même PDU
            for (int i = 0; i < smsArray.length(); i++) {
                JSONObject item = smsArray.getJSONObject(i);
                if (item.optLong("timestamp", 0) == timestamp &&
                    item.optString("sender", "").equals(sender) &&
                    item.optString("message", "").equals(message)) {
                    Log.d(TAG, "SMS identique déjà présent dans la file d'attente SharedPreferences, doublon ignoré.");
                    return;
                }
            }

            JSONObject sms = new JSONObject();
            sms.put("sender", sender);
            sms.put("message", message);
            sms.put("timestamp", timestamp);
            sms.put("subscriptionId", subscriptionId);
            sms.put("receiverPhoneNumber", receiverPhoneNumber != null ? receiverPhoneNumber : "");

            smsArray.put(sms);

            prefs.edit().putString(KEY_PENDING_SMS, smsArray.toString()).apply();
            Log.d(TAG, "SMS ajouté à la file locale SharedPreferences (total en attente: " + smsArray.length() + ")");
        } catch (JSONException e) {
            Log.e(TAG, "Erreur lors du stockage local du SMS", e);
        }
    }
}
