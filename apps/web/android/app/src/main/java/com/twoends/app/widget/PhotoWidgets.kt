package com.twoends.app.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
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
import androidx.glance.layout.size
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
        val face = WidgetStore.bitmap(context, if (snapshot.snapFromThem) "avatarThem" else "avatarMe")
        provideContent { SnapsContent(snapshot, photo, face) }
    }
}

class SnapsReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SnapsWidget()
}

@Composable
private fun SnapsContent(snapshot: WidgetStore.Snapshot, photo: Bitmap?, face: Bitmap?) {
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
        Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.TopEnd) {
            /*
              Whose photo it is, as their face. Candle's canvas widget does the
              same thing and it is the right instinct: the eyebrow below already
              says the name, and a name is a thing you read while a face is a
              thing you recognise.

              Composed as its own node rather than painted into `frame()`, which
              re-encodes the entire photograph on every redraw — doubling that
              work for a badge that has not changed would be a bad trade for two
              extra RemoteViews entries.
            */
            Image(
                provider = ImageProvider(
                    avatarBitmap(
                        photo = face,
                        accent = accent,
                        initial = who,
                        sizePx = 26 * 3,
                        ring = 0x4DFFFFFF,
                        ringPx = 3f,
                    ),
                ),
                contentDescription = who,
                modifier = GlanceModifier.size(26.dp),
            )
        }
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
        val face =
            WidgetStore.bitmap(context, if (snapshot.canvasFromThem) "avatarThem" else "avatarMe")
        provideContent { CanvasContent(snapshot, drawing, face) }
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
private fun CanvasContent(snapshot: WidgetStore.Snapshot, drawing: Bitmap?, face: Bitmap?) {
    if (drawing == null) {
        Empty(
            eyebrow = "canvas",
            line = if (snapshot.paired) "Draw them something" else "Pair to share a canvas",
            accent = snapshot.myAccent,
        )
        return
    }

    val accent = if (snapshot.canvasFromThem) snapshot.theirAccent else snapshot.myAccent
    val who = if (snapshot.canvasFromThem) snapshot.theirName else snapshot.myName

    // Tinted with whoever drew last, so the card changes colour when they do.
    Shell(from = tint(accent)) {
        Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.TopEnd) {
            Image(
                provider = ImageProvider(
                    avatarBitmap(
                        photo = face,
                        accent = accent,
                        initial = who,
                        sizePx = 26 * 3,
                        ring = 0x33FFFFFF,
                        ringPx = 3f,
                    ),
                ),
                contentDescription = who,
                modifier = GlanceModifier.size(26.dp),
            )
        }
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Eyebrow(
                if (snapshot.canvasFromThem) "${snapshot.theirName.lowercase()} drew" else "canvas",
                Color(accent),
            )
            Box(
                modifier = GlanceModifier.fillMaxSize().padding(top = 6.dp, end = 20.dp),
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

// `centreCrop` moved to Theme.kt — the avatar circles need the identical maths,
// and two copies of a crop rectangle is how a face ends up framed differently
// from the photograph beside it.
