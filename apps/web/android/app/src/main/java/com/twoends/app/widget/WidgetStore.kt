package com.twoends.app.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONObject
import java.io.File

/**
 * What the widgets know.
 *
 * The app's real data lives in IndexedDB inside a WebView. A launcher cannot
 * read that — it is not a database the system can reach, and the WebView is not
 * running when the home screen is. So the app pushes a snapshot out to
 * SharedPreferences every time something changes, and the widgets read only
 * this.
 *
 * The alternative was letting each widget fetch from Supabase. That would mean
 * six background processes holding auth tokens, waking the radio on a timer,
 * for data the app already has. A widget that costs battery gets removed, and a
 * removed widget is the whole product failing.
 *
 * Everything here is derived and disposable. Nothing in this file is the only
 * copy of anything.
 */
object WidgetStore {
    private const val PREFS = "twoends_widgets"
    private const val KEY = "snapshot"
    private const val IMAGE_DIR = "widgets"

    /**
     * Dates are stored as written, never as a day count.
     *
     * A widget redrawn at 23:59 and again at 00:01 must show different numbers
     * without the app having run in between. Storing the anchor and counting at
     * draw time is what makes that true; storing "412 days" would freeze until
     * the next launch.
     */
    data class Snapshot(
        val myName: String,
        val theirName: String,
        val myAccent: Int,
        val theirAccent: Int,
        val startedOn: String?,
        val streak: Int,
        val doneToday: Boolean,
        /**
         * Seven characters, Monday first: `d` done, `g` missed but forgiven,
         * `.` missed or still to come. A string rather than a list because it
         * survives a round trip through SharedPreferences without a schema.
         */
        val week: String,
        val countdownTitle: String?,
        val countdownAt: String?,
        val snapFromThem: Boolean,
        val snapCaption: String?,
        val canvasFromThem: Boolean,
        /**
         * The two lines the distance widget prints, already written by the app.
         *
         * Not a number, deliberately. Whether a reading is "412", "same city" or
         * "here" depends on the grid the coordinate was rounded to and on which
         * of the two people opted into precise — questions this process has no
         * way to answer and no business asking. Both are null until both people
         * have switched location on.
         */
        val distanceLabel: String?,
        val distanceNote: String?,
        val quiet: Boolean,
    ) {
        val paired: Boolean get() = theirName.isNotEmpty()
    }

    private val EMPTY = Snapshot(
        myName = "",
        theirName = "",
        myAccent = 0xFFE8A87C.toInt(),
        theirAccent = 0xFFB6A6E8.toInt(),
        startedOn = null,
        streak = 0,
        doneToday = false,
        week = ".......",
        countdownTitle = null,
        countdownAt = null,
        snapFromThem = false,
        snapCaption = null,
        canvasFromThem = false,
        distanceLabel = null,
        distanceNote = null,
        quiet = false,
    )

    fun read(context: Context): Snapshot {
        val raw = context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, null)
            ?: return EMPTY

        return try {
            val json = JSONObject(raw)
            Snapshot(
                myName = json.optString("myName", ""),
                theirName = json.optString("theirName", ""),
                myAccent = parseColor(json.optString("myAccent"), EMPTY.myAccent),
                theirAccent = parseColor(json.optString("theirAccent"), EMPTY.theirAccent),
                startedOn = json.optStringOrNull("startedOn"),
                streak = json.optInt("streak", 0),
                doneToday = json.optBoolean("doneToday", false),
                week = json.optString("week", ".......").padEnd(7, '.').take(7),
                countdownTitle = json.optStringOrNull("countdownTitle"),
                countdownAt = json.optStringOrNull("countdownAt"),
                snapFromThem = json.optBoolean("snapFromThem", false),
                snapCaption = json.optStringOrNull("snapCaption"),
                canvasFromThem = json.optBoolean("canvasFromThem", false),
                distanceLabel = json.optStringOrNull("distanceLabel"),
                distanceNote = json.optStringOrNull("distanceNote"),
                quiet = json.optBoolean("quiet", false),
            )
        } catch (_: Exception) {
            // A malformed snapshot must never crash a launcher. The widget shows
            // its empty state, and the next app launch overwrites this.
            EMPTY
        }
    }

    fun write(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, json)
            .apply()
    }

    /** Wipes the snapshot and every cached image. Called on sign-out and unpair. */
    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        imageDir(context).listFiles()?.forEach { it.delete() }
    }

    // ── images ───────────────────────────────────────────────────────────────

    /*
      Deliberately not `.webp`. The app encodes WebP where it can and falls back
      to JPEG on iOS Safari, so the extension would be a guess — and
      BitmapFactory sniffs the header rather than trusting the name.
    */
    fun imageFile(context: Context, name: String): File = File(imageDir(context), "$name.img")

    /**
     * Decoded straight off disk on every draw rather than held in memory.
     *
     * A widget process is killed and restarted freely by the launcher, so a
     * cache here would be cleared more often than it was read, and holding a
     * bitmap alive across that is how a widget gets blamed for memory pressure.
     */
    fun bitmap(context: Context, name: String): Bitmap? {
        val file = imageFile(context, name)
        if (!file.exists()) return null
        return try {
            BitmapFactory.decodeFile(file.absolutePath)
        } catch (_: Exception) {
            null
        }
    }

    fun imageDir(context: Context): File =
        File(context.filesDir, IMAGE_DIR).also { if (!it.exists()) it.mkdirs() }

    // ── helpers ──────────────────────────────────────────────────────────────

    private fun JSONObject.optStringOrNull(key: String): String? {
        if (isNull(key)) return null
        val value = optString(key, "")
        return value.ifEmpty { null }
    }

    private fun parseColor(value: String?, fallback: Int): Int {
        if (value.isNullOrEmpty()) return fallback
        return try {
            android.graphics.Color.parseColor(value)
        } catch (_: IllegalArgumentException) {
            fallback
        }
    }
}
