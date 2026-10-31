package cd.etsamani.app.plugins;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.telephony.SubscriptionManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PluginMethod;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(
            alias = "sms",
            strings = {
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.READ_SMS,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.READ_PHONE_NUMBERS
            }
        )
    }
)
public class SmsReaderPlugin extends Plugin {

    private static SmsReaderPlugin instance;

    private static final int SMS_PERMISSION_REQUEST = 1001;

    private static final String PREFS_NAME =
        "EtsAmaniSmsReader";

    private static final String KEY_PENDING_SMS =
        "pending_sms";

    private static final String KEY_CONFIGURED_PHONE =
        "configured_receiver_phone";

    private static final String KEY_CONFIGURED_INTERNAL_ID =
        "configured_internal_number_id";

    public static SmsReaderPlugin getInstance() {
        return instance;
    }

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void checkPermissions(
        PluginCall call
    ) {

        boolean receiveSms =
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.RECEIVE_SMS
            ) == PackageManager.PERMISSION_GRANTED;

        boolean readSms =
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.READ_SMS
            ) == PackageManager.PERMISSION_GRANTED;

        boolean readPhoneState =
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED;

        boolean readPhoneNumbers =
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.READ_PHONE_NUMBERS
            ) == PackageManager.PERMISSION_GRANTED;

        JSObject result =
            new JSObject();

        result.put(
            "receiveSms",
            receiveSms
        );

        result.put(
            "readSms",
            readSms
        );

        result.put(
            "readPhoneState",
            readPhoneState
        );

        result.put(
            "readPhoneNumbers",
            readPhoneNumbers
        );

        result.put(
            "granted",
            receiveSms
                && readSms
                && readPhoneState
                && readPhoneNumbers
        );

        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(
        PluginCall call
    ) {

        boolean receiveGranted =
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.RECEIVE_SMS
            ) == PackageManager.PERMISSION_GRANTED;

        boolean readGranted =
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.READ_SMS
            ) == PackageManager.PERMISSION_GRANTED;

        boolean phoneStateGranted =
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED;

        boolean phoneNumbersGranted =
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.READ_PHONE_NUMBERS
            ) == PackageManager.PERMISSION_GRANTED;

        if (
            !receiveGranted
            || !readGranted
            || !phoneStateGranted
            || !phoneNumbersGranted
        ) {

            ActivityCompat.requestPermissions(
                getActivity(),
                new String[] {
                    Manifest.permission.RECEIVE_SMS,
                    Manifest.permission.READ_SMS,
                    Manifest.permission.READ_PHONE_STATE,
                    Manifest.permission.READ_PHONE_NUMBERS
                },
                SMS_PERMISSION_REQUEST
            );
        }

        JSObject result =
            new JSObject();

        result.put(
            "requested",
            true
        );

        call.resolve(result);
    }

    @PluginMethod
    public void getPhoneNumberForSubscription(
        PluginCall call
    ) {

        int subscriptionId =
            call.getInt("subscriptionId", -1);

        if (subscriptionId < 0) {
            call.reject(
                "subscriptionId invalide"
            );
            return;
        }

        try {

            if (
                ContextCompat.checkSelfPermission(
                    getContext(),
                    Manifest.permission.READ_PHONE_STATE
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                call.reject(
                    "Permission READ_PHONE_STATE non accordée"
                );
                return;
            }

            if (
                ContextCompat.checkSelfPermission(
                    getContext(),
                    Manifest.permission.READ_PHONE_NUMBERS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                call.reject(
                    "Permission READ_PHONE_NUMBERS non accordée"
                );
                return;
            }

            SubscriptionManager subscriptionManager =
                getContext().getSystemService(
                    SubscriptionManager.class
                );

            if (subscriptionManager == null) {
                call.reject(
                    "SubscriptionManager indisponible"
                );
                return;
            }

            String phoneNumber =
                subscriptionManager.getPhoneNumber(
                    subscriptionId
                );

            JSObject result =
                new JSObject();

            result.put(
                "subscriptionId",
                subscriptionId
            );

            result.put(
                "phoneNumber",
                phoneNumber == null
                    ? ""
                    : phoneNumber
            );

            result.put(
                "found",
                phoneNumber != null
                    && !phoneNumber.trim().isEmpty()
            );

            call.resolve(result);

        } catch (SecurityException e) {

            call.reject(
                "Accès au numéro de la SIM refusé par Android",
                e
            );

        } catch (Exception e) {

            call.reject(
                "Impossible de récupérer le numéro de la SIM",
                e
            );
        }
    }

    @PluginMethod
    public void getPendingSms(
        PluginCall call
    ) {

        SharedPreferences prefs =
            getContext()
                .getSharedPreferences(
                    PREFS_NAME,
                    Context.MODE_PRIVATE
                );

        String stored =
            prefs.getString(
                KEY_PENDING_SMS,
                "[]"
            );

        JSArray result =
            new JSArray();

        try {

            JSONArray array =
                new JSONArray(stored);

            for (
                int i = 0;
                i < array.length();
                i++
            ) {

                JSONObject item =
                    array.getJSONObject(i);

                JSObject sms =
                    new JSObject();

                sms.put(
                    "sender",
                    item.optString(
                        "sender",
                        ""
                    )
                );

                sms.put(
                    "message",
                    item.optString(
                        "message",
                        ""
                    )
                );

                sms.put(
                    "timestamp",
                    item.optLong(
                        "timestamp",
                        0
                    )
                );

                sms.put(
                    "subscriptionId",
                    item.optInt(
                        "subscriptionId",
                        -1
                    )
                );

                sms.put(
                    "receiverPhoneNumber",
                    item.optString(
                        "receiverPhoneNumber",
                        ""
                    )
                );

                result.put(sms);
            }

            prefs.edit()
                .remove(KEY_PENDING_SMS)
                .apply();

            JSObject response =
                new JSObject();

            response.put(
                "items",
                result
            );

            call.resolve(response);

        } catch (JSONException e) {

            call.reject(
                "Impossible de lire les SMS en attente",
                e
            );
        }
    }

    @PluginMethod
    public void setConfiguredCollectorNumber(
        PluginCall call
    ) {
        String phoneNumber = call.getString("phoneNumber", "");
        String internalNumberId = call.getString("internalNumberId", "");
        int subscriptionId = call.getInt("subscriptionId", -1);

        SharedPreferences prefs =
            getContext()
                .getSharedPreferences(
                    PREFS_NAME,
                    Context.MODE_PRIVATE
                );

        SharedPreferences.Editor editor = prefs.edit();

        if (phoneNumber != null) {
            editor.putString(KEY_CONFIGURED_PHONE, phoneNumber.trim());
        }
        if (internalNumberId != null) {
            editor.putString(KEY_CONFIGURED_INTERNAL_ID, internalNumberId.trim());
        }
        if (subscriptionId >= 0 && phoneNumber != null) {
            editor.putString("sub_" + subscriptionId + "_phone", phoneNumber.trim());
        }

        editor.apply();

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("phoneNumber", phoneNumber);
        result.put("internalNumberId", internalNumberId);
        call.resolve(result);
    }

    @PluginMethod
    public void getConfiguredCollectorNumber(
        PluginCall call
    ) {
        SharedPreferences prefs =
            getContext()
                .getSharedPreferences(
                    PREFS_NAME,
                    Context.MODE_PRIVATE
                );

        String phoneNumber = prefs.getString(KEY_CONFIGURED_PHONE, "");
        String internalNumberId = prefs.getString(KEY_CONFIGURED_INTERNAL_ID, "");

        JSObject result = new JSObject();
        result.put("phoneNumber", phoneNumber != null ? phoneNumber : "");
        result.put("internalNumberId", internalNumberId != null ? internalNumberId : "");
        result.put("isConfigured", phoneNumber != null && !phoneNumber.trim().isEmpty());
        call.resolve(result);
    }

    public void notifySmsReceived(
        String sender,
        String message,
        long timestamp,
        int subscriptionId,
        String receiverPhoneNumber
    ) {

        JSObject data =
            new JSObject();

        data.put(
            "sender",
            sender
        );

        data.put(
            "message",
            message
        );

        data.put(
            "timestamp",
            timestamp
        );

        data.put(
            "subscriptionId",
            subscriptionId
        );

        data.put(
            "receiverPhoneNumber",
            receiverPhoneNumber == null
                ? ""
                : receiverPhoneNumber
        );

        notifyListeners(
            "smsReceived",
            data
        );
    }
}
