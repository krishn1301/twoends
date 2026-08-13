package com.twoends.app

import android.util.Base64
import androidx.glance.appwidget.updateAll
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.twoends.app.widget.AnniversaryWidget
import com.twoends.app.widget.CanvasWidget
import com.twoends.app.widget.CountdownWidget
import com.twoends.app.widget.DistanceWidget
import com.twoends.app.widget.SnapsWidget
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
    }
}
