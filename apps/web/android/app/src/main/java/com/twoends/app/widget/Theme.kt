package com.twoends.app.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.compose.runtime.Composable
import com.twoends.app.MainActivity
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

/**
 * The shared look, and the arithmetic behind it.
 *
 * The app's design rule is that no surface is a neutral grey — every one is your
 * accent, their accent, or a gradient across both. That holds here, which is why
 * the backgrounds are drawn as bitmaps rather than set as a colour: Glance's
 * `cornerRadius` needs API 31, the phone this is built for runs API 29, and a
 * square-cornered widget on a rounded launcher looks broken.
 *
 * Glance cannot use the app's Fraunces and Karla either. RemoteViews only reach
 * for fonts the launcher process can resolve, and a custom one is not among
 * them. The widgets therefore lean on size and weight where the app leans on
 * typeface.
 */

const val VOID = 0xFF000000.toInt()
val Chalk = Color(0xFFF3EDE7)
val Ash = Color(0xFF948A82)

// ── surfaces ─────────────────────────────────────────────────────────────────

/**
 * A rounded background, drawn.
 *
 * Capped at 1200x1200 because a RemoteViews payload crosses a Binder
 * transaction, and an oversized bitmap there does not degrade — it throws
 * TransactionTooLarge and the widget shows the launcher's error tile.
 */
fun roundedBitmap(
    widthPx: Int,
    heightPx: Int,
    from: Int,
    to: Int,
    radiusPx: Float,
): Bitmap {
    val w = widthPx.coerceIn(1, 1200)
    val h = heightPx.coerceIn(1, 1200)
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    if (from == to) {
        paint.color = from
    } else {
        paint.shader = LinearGradient(
            0f, 0f, w.toFloat(), h.toFloat(), from, to, Shader.TileMode.CLAMP,
        )
    }

    canvas.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), radiusPx, radiusPx, paint)
    return bitmap
}

/**
 * Every widget's outer frame: rounded, tappable, opens the app.
 *
 * `ground` defaults to true black. Where a widget wants colour it passes one or
 * two accents and gets a gradient.
 */
@Composable
fun Shell(
    from: Int = VOID,
    to: Int = from,
    content: @Composable () -> Unit,
) {
    val size = LocalSize.current
    // Glance reports size in dp; the bitmap wants pixels. Three is a safe
    // stand-in for density here — over-sampling costs memory, under-sampling
    // shows as a soft edge on the corner radius.
    val scale = 3f
    val bitmap = roundedBitmap(
        widthPx = (size.width.value * scale).toInt(),
        heightPx = (size.height.value * scale).toInt(),
        from = from,
        to = to,
        radiusPx = 24f * scale,
    )

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .clickable(actionStartActivity<MainActivity>()),
        contentAlignment = Alignment.TopStart,
    ) {
        Image(
            provider = ImageProvider(bitmap),
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = GlanceModifier.fillMaxSize(),
        )
        Box(modifier = GlanceModifier.fillMaxSize().padding(14.dp)) { content() }
    }
}

/** The lowercase label every card in the app carries above its headline. */
@Composable
fun Eyebrow(text: String, color: Color = Ash) {
    Text(
        text = text,
        style = TextStyle(color = ColorProvider(color), fontSize = 11.sp, fontWeight = FontWeight.Medium),
    )
}

@Composable
fun Headline(text: String, size: Int = 15, color: Color = Chalk, maxLines: Int = 2) {
    Text(
        text = text,
        maxLines = maxLines,
        style = TextStyle(
            color = ColorProvider(color),
            fontSize = size.sp,
            fontWeight = FontWeight.Medium,
        ),
    )
}

@Composable
fun Counter(text: String, size: Int = 34, color: Color = Chalk) {
    Text(
        text = text,
        style = TextStyle(
            color = ColorProvider(color),
            fontSize = size.sp,
            fontWeight = FontWeight.Bold,
        ),
    )
}

/**
 * What a widget shows before there is anything to show.
 *
 * Never a spinner and never blank. A widget with no content still occupies the
 * home screen, so it has to say something true about why.
 */
@Composable
fun Empty(eyebrow: String, line: String, accent: Int) {
    Shell {
        Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) {
            Eyebrow(eyebrow, Color(accent))
            Headline(line, size = 14, color = Ash)
        }
    }
}

// ── dates ────────────────────────────────────────────────────────────────────

/**
 * Whole days between two calendar dates, counted in the local zone.
 *
 * `ChronoUnit.DAYS` on `LocalDate` rather than a millisecond subtraction: the
 * latter is wrong by a day twice a year in any zone that observes daylight
 * saving, and wrong in a way nobody notices until an anniversary is off.
 */
fun daysSince(isoDate: String?, today: LocalDate = LocalDate.now()): Long? {
    val start = parseDate(isoDate) ?: return null
    return ChronoUnit.DAYS.between(start, today).coerceAtLeast(0)
}

fun daysUntil(isoInstant: String?, today: LocalDate = LocalDate.now()): Long? {
    val target = parseDate(isoInstant) ?: return null
    return ChronoUnit.DAYS.between(today, target)
}

private fun parseDate(value: String?): LocalDate? {
    if (value.isNullOrEmpty()) return null
    return try {
        // Countdowns are stored as timestamps, the anniversary as a plain date.
        if (value.length <= 10) LocalDate.parse(value)
        else OffsetDateTime.parse(value).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate()
    } catch (_: DateTimeParseException) {
        null
    }
}
