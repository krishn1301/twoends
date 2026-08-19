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
import androidx.glance.LocalSize
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
        val mine = WidgetStore.bitmap(context, "avatarMe")
        val theirs = WidgetStore.bitmap(context, "avatarThem")
        provideContent { AnniversaryContent(snapshot, mine, theirs) }
    }
}

class AnniversaryReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AnniversaryWidget()
}

@Composable
private fun AnniversaryContent(
    snapshot: WidgetStore.Snapshot,
    mine: Bitmap?,
    theirs: Bitmap?,
) {
    val days = daysSince(snapshot.startedOn)
    if (days == null) {
        Empty("anniversary", "Set the day you started", snapshot.myAccent)
        return
    }

    /*
      The one surface that is both accents at once. The app uses this gradient
      for anything that belongs to the pair rather than to either person, and
      the day count is the most jointly-owned number there is.

      The faces overlap here rather than being held apart by a heart, because
      the overlap *is* the word: it is the launcher mark, made of the two of you.
      Nothing is being cropped by anything, which is why the same arrangement
      would be wrong on the distance widget and is right on this one.
    */
    /*
      The eyebrow is where the widget says what day it is.

      Worked out here from the anchors rather than read out of a label the app
      wrote, because the whole reason this is worth doing is the morning nobody
      opens the app — and a label written at push time is a label written
      yesterday. `occasionToday` is a second copy of the rule in
      `occasions.ts`; the comment on it says so, and says what that costs.

      It replaces "together" rather than adding a line, so nothing moves and the
      widget is the same shape on the day as on every other day. A widget that
      grows a row once a year is a widget that overlaps its neighbour once a
      year, on a home screen nobody has re-arranged since.
    */
    val occasion = occasionToday(
        startedOn = snapshot.startedOn,
        myBirthday = snapshot.myBirthday,
        theirBirthday = snapshot.theirBirthday,
        theirName = snapshot.theirName,
    )

    Shell(from = snapshot.myAccent, to = snapshot.theirAccent) {
        Row(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.Bottom,
        ) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Eyebrow(occasion ?: "together", Color.White)
                Counter("$days", size = 32, color = Color.White)
                Headline(if (days == 1L) "day" else "days", size = 12, color = Color.White)
            }
            Image(
                provider = ImageProvider(
                    pairMark(
                        mine = mine,
                        theirs = theirs,
                        myAccent = snapshot.myAccent,
                        theirAccent = snapshot.theirAccent,
                        myInitial = snapshot.myName,
                        theirInitial = snapshot.theirName,
                        widthPx = 62 * 3,
                        heightPx = 36 * 3,
                        style = MarkStyle.Together,
                    ),
                ),
                contentDescription = "${snapshot.myName} and ${snapshot.theirName}",
                modifier = GlanceModifier.width(62.dp).height(36.dp),
            )
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

    /*
      How far through the wait you are.

      The number says how many days are left, which is a fact you cannot feel.
      A rule filling up says the same thing as a shape — "12" and "12, and you
      are two thirds of the way there" are different sentences.

      `countdownFrom` is when it was added, so the fraction is elapsed over
      total. A countdown created the same day it lands would divide by zero, and
      one restored from an export could have a creation date after its target;
      both fall back to a full rule, which is honest — a wait with no measurable
      length is over.
    */
    val since = daysSince(snapshot.countdownFrom)
    val span = if (since != null && left > 0L) since + left else 0L
    val progress = if (span > 0L) since!!.toFloat() / span else 1f

    Shell(from = tint(snapshot.theirAccent)) {
        Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) {
            Eyebrow("countdown", accent)
            Counter(
                text = when {
                    left < 0L -> "—"
                    else -> "$left"
                },
                size = 34,
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
                maxLines = 1,
            )
            Spacer(modifier = GlanceModifier.height(7.dp))
            Image(
                provider = ImageProvider(
                    progressRule(progress, snapshot.theirAccent, widthPx = 132 * 3, heightPx = 9),
                ),
                contentDescription = null,
                modifier = GlanceModifier.width(132.dp).height(3.dp),
            )
        }
    }
}

// ── streak ───────────────────────────────────────────────────────────────────

class StreakWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.read(context)
        val mine = WidgetStore.bitmap(context, "avatarMe")
        val theirs = WidgetStore.bitmap(context, "avatarThem")
        provideContent { StreakContent(snapshot, mine, theirs) }
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
 *
 * The two faces at the top are deliberately *not* tied to who has answered
 * today. A face that appeared or vanished with compliance would be a nag with a
 * photograph on it, which is worse than the red this widget already refuses.
 */
@Composable
private fun StreakContent(
    snapshot: WidgetStore.Snapshot,
    mine: Bitmap?,
    theirs: Bitmap?,
) {
    val accent = Color(snapshot.myAccent)

    Shell(from = tint(snapshot.myAccent)) {
        /*
          Centred, unlike its siblings, and only because of the shape.

          The other three are 2x1 strips where bottom-aligning the block sits it
          exactly where the eye expects — the same anatomy the app's cards use.
          This one asks for 2x2, and on a real launcher that turned into a tall
          black tile with an empty top half and everything crammed against the
          bottom edge. It read as a rendering fault rather than a decision. That
          is not something the emulator or a screenshot of the app could have
          shown; it took placing the thing on a home screen.
        */
        Column(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Image(
                provider = ImageProvider(
                    pairMark(
                        mine = mine,
                        theirs = theirs,
                        myAccent = snapshot.myAccent,
                        theirAccent = snapshot.theirAccent,
                        myInitial = snapshot.myName,
                        theirInitial = snapshot.theirName,
                        widthPx = 56 * 3,
                        heightPx = 32 * 3,
                        style = MarkStyle.Together,
                    ),
                ),
                contentDescription = "${snapshot.myName} and ${snapshot.theirName}",
                modifier = GlanceModifier.width(56.dp).height(32.dp),
            )

            Spacer(modifier = GlanceModifier.height(10.dp))

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
        val mine = WidgetStore.bitmap(context, "avatarMe")
        val theirs = WidgetStore.bitmap(context, "avatarThem")
        provideContent { DistanceContent(snapshot, mine, theirs) }
    }
}

class DistanceReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DistanceWidget()
}

/**
 * The same widget, offered in a second shape.
 *
 * Two providers rather than one that resizes, because the choice is worth making
 * when you place it: a square with two faces you can actually see, or a strip
 * that fits in a row above your apps. The launcher's picker is where that
 * decision belongs, and a widget you have to drag-resize after placing is one
 * most people never resize.
 *
 * Both draw from `DistanceContent`, which branches on the size it is actually
 * handed — see the comment there. This class exists to give the picker a second
 * entry, not to give the drawing a second implementation.
 */
class DistanceStripWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.read(context)
        val mine = WidgetStore.bitmap(context, "avatarMe")
        val theirs = WidgetStore.bitmap(context, "avatarThem")
        provideContent { DistanceContent(snapshot, mine, theirs) }
    }
}

class DistanceStripReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DistanceStripWidget()
}

/**
 * How far apart, and never where.
 *
 * The snapshot carries three finished strings that the app wrote. No coordinate
 * ever reaches this process, and neither does a distance in kilometres — so
 * there is nothing here to leak to a launcher, a backup, or whoever picks the
 * phone up. That is what makes the promise in docs/PRIVACY.md structural rather
 * than a policy: this code could not disclose a position if it wanted to.
 *
 * It also means the rounding rules live in exactly one place. `readDistance` in
 * `packages/core/src/distance.ts` decides whether a reading is a number, "same
 * city" or "here", and this draws whatever it decided.
 *
 * The shape: the distance across the top, the two of you underneath, a heart in
 * the gap. That is what was asked for, and it is right — the number is what you
 * glance at, and the faces are what make it mean something rather than being a
 * fact about two dots.
 */
@Composable
private fun DistanceContent(
    snapshot: WidgetStore.Snapshot,
    mine: Bitmap?,
    theirs: Bitmap?,
) {
    val accent = Color(snapshot.theirAccent)
    val title = snapshot.distanceTitle

    /*
      Branch on the size actually delivered, not on which provider this is.

      `targetCellWidth` and `targetCellHeight` are API 31 attributes and are
      ignored outright on the phone this is built for — only `minWidth` and
      `minHeight` are consulted, and the launcher then rounds up to whole cells
      on a grid that differs per device and per user setting. So a "2x1" widget
      arrives at a height nobody declared. That is exactly how the streak widget
      once ended up bottom-aligned in a tall black tile with an empty top half.

      It also covers the migration: raising `minHeight` does not resize the
      instances already sitting on someone's home screen, so the widget placed
      last night keeps arriving strip-shaped until it is removed and re-added.
    */
    val tall = LocalSize.current.height >= 96.dp

    /*
      The note is the first thing to go, and 150dp is where it earns its place.

      Measured rather than guessed: eyebrow 15 + counter 30 + spacer 6 + mark 40
      is 91dp of content, and `Shell` adds 14dp of padding top and bottom, so the
      widget without a note needs 119dp. A line of 11sp text plus its spacer is
      another 21. At 130 the first version overflowed and the note came out
      sliced in half along its baseline, which looks like a bug rather than a
      tight fit — because it is one.
    */
    val roomForNote = LocalSize.current.height >= 150.dp

    val mark = @Composable { width: Int, height: Int ->
        Image(
            provider = ImageProvider(
                pairMark(
                    mine = mine,
                    theirs = theirs,
                    myAccent = snapshot.myAccent,
                    theirAccent = snapshot.theirAccent,
                    myInitial = snapshot.myName,
                    theirInitial = snapshot.theirName,
                    widthPx = width * 3,
                    heightPx = height * 3,
                    style = if (title == null) MarkStyle.Locked else MarkStyle.Apart,
                ),
            ),
            contentDescription = "${snapshot.myName} and ${snapshot.theirName}",
            modifier = GlanceModifier.width(width.dp).height(height.dp),
        )
    }

    // Locked and unlocked share a layout on purpose. A widget that still shows
    // two faces is worth keeping on a home screen while you decide; three lines
    // of grey text is what gets dragged to the bin — and with location off by
    // default, this is the state most people meet first.
    val heading = title ?: "—"
    val note = snapshot.distanceNote
        ?: if (snapshot.paired) "Both of you turn it on" else "Pair first"

    Shell(from = tint(snapshot.theirAccent)) {
        if (tall) {
            Column(
                modifier = GlanceModifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Eyebrow(if (title == null) "distance" else "apart", accent)
                Counter(text = heading, size = if (heading.length > 7) 20 else 26, color = accent)
                Spacer(modifier = GlanceModifier.height(6.dp))
                mark(126, 40)
                if (roomForNote) {
                    Spacer(modifier = GlanceModifier.height(6.dp))
                    Headline(text = note, size = 11, color = Ash, maxLines = 1)
                }
            }
        } else {
            Row(
                modifier = GlanceModifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                mark(88, 32)
                Spacer(modifier = GlanceModifier.width(10.dp))
                Column {
                    Eyebrow(if (title == null) "distance" else "apart", accent)
                    Counter(
                        text = snapshot.distanceLabel ?: "—",
                        size = if ((snapshot.distanceLabel?.length ?: 1) > 4) 17 else 24,
                        color = accent,
                    )
                }
            }
        }
    }
}

/** Exposed for the daily rollover check; keeps `LocalDate` out of the widgets. */
internal fun today(): LocalDate = LocalDate.now()
