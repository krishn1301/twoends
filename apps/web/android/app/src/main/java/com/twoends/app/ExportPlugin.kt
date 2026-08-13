package com.twoends.app

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream

/**
 * Puts a file in the user's Downloads folder.
 *
 * This exists because an `<a download>` on a blob URL — which is how every
 * browser saves a generated file, and how the PWA saves the export — does
 * nothing at all inside an Android WebView. There is no download manager
 * listening, no error, and no way for the web layer to tell. The export button
 * would appear to work and produce no file.
 *
 * Deliberately narrow: it writes one file, to Downloads, with a name the app
 * chooses, and it returns where it went so the app can say so. It cannot read
 * anything, list anything, or write anywhere else.
 *
 * Two APIs, because Android changed how this works. From API 29 the app has no
 * filesystem access to Downloads and must go through MediaStore, which needs no
 * permission at all. Below that, WRITE_EXTERNAL_STORAGE would be required — so
 * instead the file goes to the app's own external files directory, which needs
 * no permission either. Asking for storage permission to save a file the user
 * just asked for would be a poor trade.
 */
@CapacitorPlugin(name = "Exporter")
class ExportPlugin : Plugin() {

    @PluginMethod
    fun save(call: PluginCall) {
        val name = call.getString("filename")
        val base64 = call.getString("data")
        val mime = call.getString("mimeType") ?: "application/octet-stream"

        if (name.isNullOrBlank() || base64.isNullOrBlank()) {
            call.reject("A filename and data are required.")
            return
        }

        // A name is all this accepts; anything that could climb out of Downloads
        // is rejected rather than sanitised, because a silently renamed file is
        // worse than a refused one.
        if (name.contains('/') || name.contains('\\') || name.contains("..")) {
            call.reject("That filename is not allowed.")
            return
        }

        val bytes = try {
            Base64.decode(base64.substringAfter("base64,", base64), Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            call.reject("Could not decode that file.", e)
            return
        }

        try {
            val where =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) saveViaMediaStore(name, mime, bytes)
                else saveToAppExternal(name, bytes)
            call.resolve(com.getcapacitor.JSObject().put("uri", where))
        } catch (e: Exception) {
            call.reject("Could not save the file.", e)
        }
    }

    private fun saveViaMediaStore(name: String, mime: String, bytes: ByteArray): String {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            // Marked pending until it is fully written, so nothing can open a
            // half-written archive from the notification shade.
            put(MediaStore.Downloads.IS_PENDING, 1)
        }

        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("Downloads is not writable")

        resolver.openOutputStream(uri)?.use { it.write(bytes) }
            ?: throw IllegalStateException("Could not open the file for writing")

        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)

        return uri.toString()
    }

    private fun saveToAppExternal(name: String, bytes: ByteArray): String {
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: throw IllegalStateException("No external storage")
        dir.mkdirs()
        val file = File(dir, name)
        FileOutputStream(file).use { it.write(bytes) }
        return file.absolutePath
    }
}
