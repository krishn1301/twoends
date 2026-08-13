package com.twoends.app.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import java.time.LocalDate

/**
 * The four widgets built from numbers.
 *
 * Each one counts from a stored anchor rather than displaying a stored count.
 * That distinction is the whole reason these stay correct: the launcher may not
 * redraw for hours and the app may not run for days, but a widget that computes
 * "days since 2024-03-11" at draw time is never stale, while one showing a
 * number written last Tuesday quietly lies.
 */

// ── anniversary ──────────────────────────────────────────────────────────────

class AnniversaryWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.read(context)
        provideContent { AnniversaryContent(snapshot) }
    }
}

class AnniversaryReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AnniversaryWidget()
}

@Composable
private fun AnniversaryContent(snapshot: WidgetStore.Snapshot) {
    val days = daysSince(snapshot.startedOn)
    if (days == null) {
        Empty("anniversary", "Set the day you started", snapshot.myAccent)
        return
    }

    /*
      The one surface that is both accents at once. The app uses this gradient
      for anything that belongs to the pair rather than to either person, and
      the day count is the most jointly-owned number there is.
    */
    Shell(from = snapshot.myAccent, to = snapshot.theirAccent) {
        Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) {
            Eyebrow("together", Color.White)
            Counter("$days", size = 40, color = Color.White)
            Headline(if (days == 1L) "day" else "days", size = 13, color = Color.White)
        }
    }
}

// ── countdown ────────────────────────────────────────────────────────────────

class CountdownWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.read(context)
        provideContent { CountdownContent(snapshot) }
    }
}

class CountdownReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CountdownWidget()
}

@Composable
private fun CountdownContent(snapshot: WidgetStore.Snapshot) {
    val left = daysUntil(snapshot.countdownAt)
    val title = snapshot.countdownTitle

    if (left == null || title == null) {
        Empty("countdown", "Add a day to look forward to", snapshot.theirAccent)
        return
    }

    val accent = Color(snapshot.theirAccent)

    Shell {
        Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) {
            Eyebrow("countdown", accent)
            Counter(
                text = when {
                    left < 0L -> "—"
                    else -> "$left"
                },
                size = 38,
                color = accent,
            )
            Headline(
                text = when {
                    left == 0L -> "today · $title"
                    left < 0L -> title
                    else -> "${if (left == 1L) "day" else "days"} · $title"
                },
                size = 13,
                color = Chalk,
            )
        }
    }
}

// ── streak ───────────────────────────────────────────────────────────────────

class StreakWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.read(context)
        provideContent { StreakContent(snapshot) }
    }
}

class StreakReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = StreakWidget()
}

/**
 * Shows the streak, and never nags about it.
 *
 * There is no "don't lose your streak!" state and no red. Two missed days a
 * month are forgiven and quiet mode pauses the count entirely — a widget that
 * turned that into pressure would undo the reason those rules exist.
 */
@Composable
private fun StreakContent(snapshot: WidgetStore.Snapshot) {
    val accent = Color(snapshot.myAccent)

    Shell {
        Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) {
            Eyebrow(if (snapshot.quiet) "quiet" else "streak", accent)

            Image(
                provider = ImageProvider(
                    weekStrip(snapshot.week, snapshot.myAccent, snapshot.theirAccent),
                ),
                contentDescription = "This week",
                modifier = GlanceModifier.height(20.dp).width(148.dp).padding(top = 4.dp),
            )

            Spacer(modifier = GlanceModifier.height(8.dp))

            Row(verticalAlignment = Alignment.Bottom) {
                Counter("${snapshot.streak}", size = 34, color = accent)
                Spacer(modifier = GlanceModifier.width(6.dp))
                Headline(
                    text = if (snapshot.streak == 1) "day" else "days",
                    size = 13,
                    color = Ash,
                )
            }
        }
    }
}

/**
 * Seven dots, Monday first.
 *
 * Drawn rather than composed because seven Glance nodes with seven background
 * bitmaps is seven times the RemoteViews payload of one strip.
 */
private fun weekStrip(week: String, mine: Int, theirs: Int): Bitmap {
    val dot = 42
    val gap = 12
    val bitmap = Bitmap.createBitmap(dot * 7 + gap * 6, dot, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val radius = dot / 2f

    week.take(7).forEachIndexed { index, mark ->
        val centreX = index * (dot + gap) + radius
        when (mark) {
            'd' -> {
                paint.style = Paint.Style.FILL
                paint.color = mine
                canvas.drawCircle(centreX, radius, radius, paint)
            }
            // Forgiven, not failed — an outline in their colour rather than a gap.
            'g' -> {
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 4f
                paint.color = theirs
                canvas.drawCircle(centreX, radius, radius - 2f, paint)
            }
            else -> {
                paint.style = Paint.Style.FILL
                paint.color = 0x1FFFFFFF
                canvas.drawCircle(centreX, radius, radius, paint)
            }
        }
    }

    return bitmap
}

// ── distance ─────────────────────────────────────────────────────────────────

class DistanceWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.read(context)
        provideContent { DistanceContent(snapshot) }
    }
}

class DistanceReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DistanceWidget()
}

/**
 * How far apart, and never where.
 *
 * The snapshot carries two finished strings that the app wrote. No coordinate
 * ever reaches this process, and neither does a distance in kilometres — so
 * there is nothing here to leak to a launcher, a backup, or whoever picks the
 * phone up. That is what makes the promise in docs/PRIVACY.md structural rather
 * than a policy: this code could not disclose a position if it wanted to.
 *
 * It also means the rounding rules live in exactly one place. `readDistance` in
 * `packages/core/src/distance.ts` decides whether a reading is a number, "same
 * city" or "here", and this draws whatever it decided.
 */
@Composable
private fun DistanceContent(snapshot: WidgetStore.Snapshot) {
    val label = snapshot.distanceLabel
    val accent = Color(snapshot.theirAccent)

    if (label == null) {
        Empty(
            eyebrow = "distance",
            line = if (snapshot.paired) "Both of you turn it on" else "Pair first",
            accent = snapshot.theirAccent,
        )
        return
    }

    Shell {
        Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) {
            Eyebrow("apart", accent)
            // A word needs more room than a number. "same city" at 34sp wraps on
            // a 2x2 cell and loses its second half.
            Counter(text = label, size = if (label.length > 4) 24 else 34, color = accent)
            Headline(text = snapshot.distanceNote ?: "", size = 13, color = Ash)
        }
    }
}

/** Exposed for the daily rollover check; keeps `LocalDate` out of the widgets. */
internal fun today(): LocalDate = LocalDate.now()
