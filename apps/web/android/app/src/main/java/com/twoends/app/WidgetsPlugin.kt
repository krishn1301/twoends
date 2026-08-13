package com.twoends.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import android.util.Base64
import androidx.glance.appwidget.updateAll
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.twoends.app.widget.AnniversaryReceiver
import com.twoends.app.widget.AnniversaryWidget
import com.twoends.app.widget.CanvasReceiver
import com.twoends.app.widget.CanvasWidget
import com.twoends.app.widget.CountdownReceiver
import com.twoends.app.widget.CountdownWidget
import com.twoends.app.widget.DistanceReceiver
import com.twoends.app.widget.DistanceWidget
import com.twoends.app.widget.SnapsReceiver
import com.twoends.app.widget.SnapsWidget
import com.twoends.app.widget.StreakReceiver
import com.twoends.app.widget.StreakWidget
import com.twoends.app.widget.WidgetStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * The only door between the web app and the home screen.
 *
 * The web app owns all the data and all the rules — whose turn it is, whether a
 * streak day was forgiven, whether both partners opted into location. None of
 * that is re-derived here. This plugin takes a finished snapshot and hands it
 * to the widgets, so there is exactly one place those rules live.
 *
 * Everything it accepts is already public to the person holding the phone. It
 * cannot read the couple's data, reach the network, or see an auth token.
 */
@CapacitorPlugin(name = "Widgets")
class WidgetsPlugin : Plugin() {

    /** Replaces the snapshot and redraws every widget. */
    @PluginMethod
    fun update(call: PluginCall) {
        val snapshot = call.getObject("snapshot")
        if (snapshot == null) {
            call.reject("A snapshot is required.")
            return
        }

        WidgetStore.write(context, snapshot.toString())
        refreshAll()
        call.resolve()
    }

    /**
     * Stores one image for a widget to draw.
     *
     * `data` is base64, with or without a data-URL prefix. The app has already
     * downscaled it — a widget never needs more than a few hundred pixels, and
     * a full-size photo here would be re-encoded on every single redraw.
     */
    @PluginMethod
    fun putImage(call: PluginCall) {
        val name = call.getString("name")
        val data = call.getString("data")

        if (name.isNullOrEmpty() || !ALLOWED_IMAGES.contains(name)) {
            call.reject("Unknown widget image.")
            return
        }

        val file = WidgetStore.imageFile(context, name)

        if (data.isNullOrEmpty()) {
            file.delete()
            refreshAll()
            call.resolve()
            return
        }

        try {
            val payload = data.substringAfter("base64,", data)
            file.writeBytes(Base64.decode(payload, Base64.DEFAULT))
        } catch (error: IllegalArgumentException) {
            call.reject("That image could not be decoded.", error)
            return
        }

        refreshAll()
        call.resolve()
    }

    /**
     * Wipes everything the widgets hold.
     *
     * Unpair and sign-out both promise a delete that actually deletes. A snap
     * still sitting on the home screen after that would make it a lie, and it
     * is the copy nobody thinks to check.
     */
    @PluginMethod
    fun clear(call: PluginCall) {
        WidgetStore.clear(context)
        refreshAll()
        call.resolve()
    }

    /**
     * Whether this launcher will let the app offer to place a widget.
     *
     * `isRequestPinAppWidgetSupported` is the honest question and the answer is
     * genuinely no on some launchers — a button that silently does nothing is
     * worse than one that is not there, so the app asks before drawing it.
     */
    @PluginMethod
    fun canPin(call: PluginCall) {
        call.resolve(JSObject().put("value", pinSupported()))
    }

    /**
     * Asks the launcher to add one widget to the home screen.
     *
     * This exists because the alternative is a sentence of instructions:
     * "long-press an empty part of your home screen, tap Widgets, scroll to
     * TwoEnds, press and hold, drag". Every step is a place to give up, and the
     * widgets are the entire reason this app has an APK at all — the one
     * feature nobody discovers is the one the whole project rests on.
     *
     * The launcher still shows its own confirmation, which is exactly right:
     * an app that could silently put things on your home screen would be a
     * worse thing to install.
     */
    @PluginMethod
    fun pin(call: PluginCall) {
        val name = call.getString("name")
        val provider = PROVIDERS[name]

        if (provider == null) {
            call.reject("Unknown widget.")
            return
        }

        if (!pinSupported()) {
            call.reject("This launcher cannot add widgets for you.")
            return
        }

        val manager = AppWidgetManager.getInstance(context)
        val component = ComponentName(context.packageName, provider)

        /*
          No callback intent. Success here means "the launcher took the request",
          not "a widget exists" — the person still has to confirm, and may not.
          Reporting the confirmation would need a broadcast receiver whose only
          job is to make the app feel clever about something it does not own.
        */
        val asked = manager.requestPinAppWidget(component, null, null)
        call.resolve(JSObject().put("value", asked))
    }

    private fun pinSupported(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported

    /**
     * Fire-and-forget on the default dispatcher.
     *
     * The web app calls this after writing a snap or an answer, and a redraw
     * that takes a moment must never hold up the UI that triggered it. If a
     * redraw is lost the next one covers it — the snapshot on disk is already
     * correct.
     */
    private fun refreshAll() {
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            SnapsWidget().updateAll(appContext)
            CanvasWidget().updateAll(appContext)
            AnniversaryWidget().updateAll(appContext)
            CountdownWidget().updateAll(appContext)
            StreakWidget().updateAll(appContext)
            DistanceWidget().updateAll(appContext)
        }
    }

    private companion object {
        val ALLOWED_IMAGES = setOf("snap", "canvas")

        /**
         * The names the web app uses, mapped to the receivers the launcher binds.
         *
         * A map rather than a constructed class name, so a string arriving from
         * the WebView can never name a component that was not meant to be here.
         * The keys match the ids in `lib/widgets.ts`.
         */
        val PROVIDERS = mapOf(
            "snaps" to SnapsReceiver::class.java.name,
            "canvas" to CanvasReceiver::class.java.name,
            "anniversary" to AnniversaryReceiver::class.java.name,
            "countdown" to CountdownReceiver::class.java.name,
            "streak" to StreakReceiver::class.java.name,
            "distance" to DistanceReceiver::class.java.name,
        )
    }
}
