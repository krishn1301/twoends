package com.twoends.app.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import androidx.core.graphics.ColorUtils
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

/**
 * The warm near-black every raised surface in the app is built on — `#15120F`,
 * straight out of `theme.css`. True black is for the page; a card is this.
 */
const val SURFACE = 0xFF15120F.toInt()

val Chalk = Color(0xFFF3EDE7)
val Ash = Color(0xFF948A82)

// ── surfaces ─────────────────────────────────────────────────────────────────

/**
 * The size a bitmap is allowed to be before it crosses a Binder transaction.
 *
 * The per-dimension cap alone is not enough, and the hole is one the user can
 * walk into: every provider declares `resizeMode="horizontal|vertical"`, so a
 * widget dragged out to 4x4 asks for 990x990 at scale 3 — 3.9 MB, under the
 * 1200 limit on both axes and far over what a transaction carrying a photo
 * beside it will take. TransactionTooLarge does not degrade; the launcher shows
 * its error tile instead of the widget.
 *
 * 1.2 megapixels is roughly a 1100x1100 square or a 1200x1000 strip — past what
 * any home-screen cell can actually show.
 */
private const val MAX_PIXELS = 1_200_000

/** Both dimensions inside their own cap, and the two of them inside the area. */
internal fun fit(widthPx: Int, heightPx: Int): Pair<Int, Int> {
    var w = widthPx.coerceIn(1, 1200)
    var h = heightPx.coerceIn(1, 1200)

    if (w * h > MAX_PIXELS) {
        val shrink = kotlin.math.sqrt(MAX_PIXELS.toDouble() / (w.toDouble() * h))
        w = (w * shrink).toInt().coerceAtLeast(1)
        h = (h * shrink).toInt().coerceAtLeast(1)
    }

    return w to h
}

/**
 * A rounded background, drawn.
 *
 * Capped because a RemoteViews payload crosses a Binder transaction, and an
 * oversized bitmap there does not degrade — it throws TransactionTooLarge and
 * the widget shows the launcher's error tile. See `fit`.
 */
fun roundedBitmap(
    widthPx: Int,
    heightPx: Int,
    from: Int,
    to: Int,
    radiusPx: Float,
): Bitmap {
    val (w, h) = fit(widthPx, heightPx)
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

/** The largest source rectangle with the target's aspect ratio, centred. */
internal fun centreCrop(source: Bitmap, widthPx: Int, heightPx: Int): Rect {
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

/**
 * The accent, tinted into the card rather than used at full strength.
 *
 * This is the Kotlin half of `color-mix(in oklab, accent 18%, #15120F)`, which
 * is what every coloured surface in the app actually is. The distinction
 * matters: the twelve accents are tuned to clear 4.5:1 *as text on black*, so
 * using one as a background and putting white on it lands around 2:1 — worse
 * than the plain black it replaced. Tinted, the card says whose it is and the
 * text stays readable.
 *
 * A linear blend in sRGB rather than oklab. At 18% the two are within a shade of
 * each other, and porting a perceptual colour space into a widget process to
 * split that hair would be a poor trade.
 */
internal fun tint(accent: Int, strength: Float = 0.18f): Int =
    ColorUtils.blendARGB(SURFACE, accent, strength)

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

// ── what today is ────────────────────────────────────────────────────────────

/**
 * The day counts worth saying out loud.
 *
 * **A second copy of `MILESTONES` in `packages/core/src/occasions.ts`, and the
 * cost is real.** A widget cannot run TypeScript, and the alternative — the app
 * writing a finished label into the snapshot — fails on exactly the morning this
 * exists for, because a label is computed when the app was last opened and this
 * has to be right when it has not been opened for a week. So the numbers are
 * written twice, and if one list changes both must.
 *
 * 365 and 730 are absent here for the same reason they are absent there: "365
 * days" and "one year" are the same sentence said twice, and for a couple who
 * started on 16 April they fall on the same morning.
 */
private val MILESTONES = longArrayOf(100, 500, 1000, 2000, 3000, 5000, 10_000)

/**
 * What today is, or null on the ordinary days that are most of them.
 *
 * Precedence is decided rather than inherited from the order of the checks:
 * anniversary, then a birthday, then a milestone. It matters because the couple
 * this was built for has three of them inside four days every April, and the
 * mirror of this rule in `occasions.ts` resolves them the same way. The minute
 * is not here at all — sixty seconds is not something a launcher redraws for.
 *
 * Computed from the anchors at draw time, so a widget the launcher has not
 * touched since yesterday still says the right thing this morning.
 */
fun occasionToday(
    startedOn: String?,
    myBirthday: String?,
    theirBirthday: String?,
    theirName: String,
    today: LocalDate = LocalDate.now(),
): String? {
    val started = parseAnchor(startedOn)

    if (started != null) {
        val years = today.year - started.year
        // Not the day you started: nought years together is not an anniversary.
        if (years >= 1 && today.monthValue == started.monthValue && today.dayOfMonth == started.dayOfMonth) {
            return if (years == 1) "one year today" else "$years years today"
        }
    }

    parseAnchor(theirBirthday)?.let {
        if (today.monthValue == it.monthValue && today.dayOfMonth == it.dayOfMonth) {
            return "${theirName.lowercase()}’s birthday"
        }
    }

    parseAnchor(myBirthday)?.let {
        if (today.monthValue == it.monthValue && today.dayOfMonth == it.dayOfMonth) {
            return "your birthday"
        }
    }

    if (started != null) {
        val days = ChronoUnit.DAYS.between(started, today)
        if (MILESTONES.contains(days)) return "$days days today"
    }

    return null
}

/** A `YYYY-MM-DD` anchor, or null. Birthdays and start dates are plain dates. */
private fun parseAnchor(value: String?): LocalDate? {
    if (value.isNullOrEmpty()) return null
    return try {
        LocalDate.parse(value.take(10))
    } catch (_: DateTimeParseException) {
        null
    }
}
