package com.twoends.app.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import com.twoends.app.MainActivity

/**
 * The two widgets that show something the other person made.
 *
 * These are the reason the app has an APK at all. A number counting up is
 * pleasant; a photo they took twenty minutes ago, sitting on your home screen
 * without you having opened anything, is the product.
 *
 * Both compose their whole visual into a single bitmap — photo, scrim and
 * rounded corners in one pass — rather than stacking Glance nodes. Every node
 * in a widget is a RemoteViews entry crossing a Binder transaction, and one
 * image plus two lines of text is the cheapest form this can take.
 */

// ── snaps ────────────────────────────────────────────────────────────────────

class SnapsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.read(context)
        val photo = WidgetStore.bitmap(context, "snap")
        provideContent { SnapsContent(snapshot, photo) }
    }
}

class SnapsReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SnapsWidget()
}

@Composable
private fun SnapsContent(snapshot: WidgetStore.Snapshot, photo: Bitmap?) {
    if (photo == null) {
        Empty(
            eyebrow = "snap",
            line = if (snapshot.paired) "Nothing yet today" else "Pair to see their day",
            accent = snapshot.myAccent,
        )
        return
    }

    val accent = if (snapshot.snapFromThem) snapshot.theirAccent else snapshot.myAccent
    val who = if (snapshot.snapFromThem) snapshot.theirName else "you"

    PhotoShell(photo) {
        Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) {
            Eyebrow(who.lowercase(), Color(accent))
            Headline(snapshot.snapCaption ?: "Right now", size = 15, maxLines = 2)
        }
    }
}

// ── canvas ───────────────────────────────────────────────────────────────────

class CanvasWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.read(context)
        val drawing = WidgetStore.bitmap(context, "canvas")
        provideContent { CanvasContent(snapshot, drawing) }
    }
}

class CanvasReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CanvasWidget()
}

/**
 * The drawing arrives already rendered.
 *
 * The strokes are a list of points in the shared canvas, and the app draws them
 * every time it opens the Draw screen. Re-implementing that renderer in Kotlin
 * would mean two codebases that have to agree on smoothing, pressure and the
 * eraser — and disagree silently when they drift. The app renders once and
 * pushes the result.
 */
@Composable
private fun CanvasContent(snapshot: WidgetStore.Snapshot, drawing: Bitmap?) {
    if (drawing == null) {
        Empty(
            eyebrow = "canvas",
            line = if (snapshot.paired) "Draw them something" else "Pair to share a canvas",
            accent = snapshot.myAccent,
        )
        return
    }

    val accent = if (snapshot.canvasFromThem) snapshot.theirAccent else snapshot.myAccent

    Shell {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Eyebrow(
                if (snapshot.canvasFromThem) "${snapshot.theirName.lowercase()} drew" else "canvas",
                Color(accent),
            )
            Box(
                modifier = GlanceModifier.fillMaxSize().padding(top = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    provider = ImageProvider(drawing),
                    contentDescription = "The shared canvas",
                    contentScale = ContentScale.Fit,
                    modifier = GlanceModifier.fillMaxSize(),
                )
            }
        }
    }
}

// ── the frame a photo needs ──────────────────────────────────────────────────

@Composable
private fun PhotoShell(photo: Bitmap, content: @Composable () -> Unit) {
    val size = LocalSize.current
    val scale = 3f
    val framed = frame(
        source = photo,
        widthPx = (size.width.value * scale).toInt().coerceIn(1, 1200),
        heightPx = (size.height.value * scale).toInt().coerceIn(1, 1200),
        radiusPx = 24f * scale,
    )

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .clickable(actionStartActivity<MainActivity>()),
        contentAlignment = Alignment.TopStart,
    ) {
        Image(
            provider = ImageProvider(framed),
            contentDescription = "A photo they sent",
            contentScale = ContentScale.FillBounds,
            modifier = GlanceModifier.fillMaxSize(),
        )
        Box(modifier = GlanceModifier.fillMaxSize().padding(14.dp)) { content() }
    }
}

/**
 * Centre-crops the photo to the widget, rounds the corners, and lays a scrim
 * over the bottom.
 *
 * The scrim is not decoration. Text on an arbitrary photograph has no contrast
 * guarantee at all — a caption over a snow scene is invisible — and this is the
 * one place in the app where the accent contrast work cannot help, because the
 * background is whatever they photographed.
 */
private fun frame(source: Bitmap, widthPx: Int, heightPx: Int, radiusPx: Float): Bitmap {
    val out = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    // Rounded mask first, then the photo drawn inside it.
    paint.color = VOID
    canvas.drawRoundRect(
        RectF(0f, 0f, widthPx.toFloat(), heightPx.toFloat()), radiusPx, radiusPx, paint,
    )

    paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    canvas.drawBitmap(source, centreCrop(source, widthPx, heightPx), RectF(0f, 0f, widthPx.toFloat(), heightPx.toFloat()), paint)
    paint.xfermode = null

    val scrimTop = heightPx * 0.45f
    paint.shader = LinearGradient(
        0f, scrimTop, 0f, heightPx.toFloat(),
        0x00000000, 0xD6000000.toInt(), Shader.TileMode.CLAMP,
    )
    canvas.drawRect(0f, scrimTop, widthPx.toFloat(), heightPx.toFloat(), paint)

    return out
}

/** The largest source rectangle with the target's aspect ratio, centred. */
private fun centreCrop(source: Bitmap, widthPx: Int, heightPx: Int): Rect {
    val targetRatio = widthPx.toFloat() / heightPx
    val sourceRatio = source.width.toFloat() / source.height

    return if (sourceRatio > targetRatio) {
        val cropWidth = (source.height * targetRatio).toInt()
        val left = (source.width - cropWidth) / 2
        Rect(left, 0, left + cropWidth, source.height)
    } else {
        val cropHeight = (source.width / targetRatio).toInt()
        val top = (source.height - cropHeight) / 2
        Rect(0, top, source.width, top + cropHeight)
    }
}
