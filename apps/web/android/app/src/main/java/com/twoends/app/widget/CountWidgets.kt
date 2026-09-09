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

    /*
      Three heights, because Glance clips and does not scale.

      "days" was being cut in half along its baseline at the size this widget
      actually arrives on a home screen. `Shell` spends 28dp of the height on
      padding, and eyebrow + 32sp counter + 12sp line is about 73dp of
      content — so on the one-cell row a 70dp `minHeight` earns, the last
      line had nowhere to go. Nothing announced it: the widget drew, and the
      bottom of one word was missing.

      The numbers in each branch are the content it needs, not guesses. A
      line of text occupies roughly 1.3 times its point size in dp.
    */
    val height = LocalSize.current.height
    val markDp = (height.value - 32f).coerceIn(24f, 40f).toInt()
    val markWide = (markDp * 1.72f).toInt()

    Shell(from = snapshot.myAccent, to = snapshot.theirAccent) {
        Row(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                when {
                    // 15 + 40 + 16 = 71dp of content, against 76dp of room.
                    height >= 104.dp -> {
                        Eyebrow(occasion ?: "together", Color.White)
                        Counter("$days", size = 30, color = Color.White)
                        Headline(
                            if (days == 1L) "day" else "days",
                            size = 12,
                            color = Color.White,
                        )
                    }
                    // The eyebrow goes first: the two faces beside it already
                    // say whose count this is.
                    height >= 84.dp -> {
                        Counter("$days", size = 26, color = Color.White)
                        Headline(
                            if (days == 1L) "day" else "days",
                            size = 11,
                            color = Color.White,
                        )
                    }
                    // One line, so there is no second line to lose.
                    else -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Counter("$days", size = 22, color = Color.White)
                        Spacer(modifier = GlanceModifier.width(5.dp))
                        Headline(
                            if (days == 1L) "day" else "days",
                            size = 11,
                            color = Color.White,
                        )
                    }
                }
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
                        widthPx = markWide * 3,
                        heightPx = markDp * 3,
                        style = MarkStyle.Together,
                    ),
                ),
                contentDescription = "${snapshot.myName} and ${snapshot.theirName}",
                modifier = GlanceModifier.width(markWide.dp).height(markDp.dp),
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

    val count = if (left < 0L) "—" else "$left"
    val line = when {
        left == 0L -> "today · $title"
        left < 0L -> title
        else -> "${if (left == 1L) "day" else "days"} · $title"
    }

    /*
      Three heights, for the reason the anniversary widget gives above, and
      this one had the most to lose. Eyebrow, a 34sp number, a 13sp line, a
      spacer and the rule come to about 87dp of content and `Shell` spends
      another 28, so any instance shorter than 118dp was throwing away
      whichever end the alignment did not favour.

      Widening a widget on a Samsung grid *shortens* it, which is why this
      looked right where it was placed and lost both its title and its
      subtitle the moment it was dragged wider — the one change nobody would
      expect to cost height.

      The progress rule goes first. It is the only thing here that repeats
      something already on the screen: the number is the fact and the rule is
      the feeling, so it is the right thing to lose when there is no room.
    */
    val height = LocalSize.current.height

    Shell(from = tint(snapshot.theirAccent)) {
        Column(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when {
                // 15 + 44 + 18 + 7 + 3 = 87dp of content, against 90dp of room.
                height >= 118.dp -> {
                    Eyebrow("countdown", accent)
                    Counter(count, size = 34, color = accent)
                    Headline(line, size = 13, color = Chalk, maxLines = 1)
                    Spacer(modifier = GlanceModifier.height(7.dp))
                    Image(
                        provider = ImageProvider(
                            progressRule(
                                progress,
                                snapshot.theirAccent,
                                widthPx = 132 * 3,
                                heightPx = 9,
                            ),
                        ),
                        contentDescription = null,
                        modifier = GlanceModifier.width(132.dp).height(3.dp),
                    )
                }
                // 15 + 37 + 17 = 69dp, against 68. The rule is what goes.
                height >= 96.dp -> {
                    Eyebrow("countdown", accent)
                    Counter(count, size = 28, color = accent)
                    Headline(line, size = 12, color = Chalk, maxLines = 1)
                }
                // One row, so there is no end of a column to cut off.
                else -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Counter(count, size = 26, color = accent)
                    Spacer(modifier = GlanceModifier.width(8.dp))
                    Headline(line, size = 12, color = Chalk, maxLines = 1)
                }
            }
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
 * **The shape is one of you at each end and the number in the gap.** It used to
 * stack — an "apart" label, the number, then both faces side by side in the
 * middle under it — and on a real home screen that read as a column of things
 * with the two people huddled in the centre and the width unused. The word
 * "apart" is gone with it: "800 km" between two faces is not ambiguous, and a
 * label that says what a number obviously means is a label nobody reads twice.
 *
 * The gap between them *is* the distance, which is the only thing this widget
 * has ever been about. Making it the widest thing on the screen is the point.
 */
@Composable
private fun DistanceContent(
    snapshot: WidgetStore.Snapshot,
    mine: Bitmap?,
    theirs: Bitmap?,
) {
    val accent = Color(snapshot.theirAccent)
    val title = snapshot.distanceTitle
    val height = LocalSize.current.height

    /*
      The faces grow with the widget and stop before they eat it.

      28dp is `Shell`'s padding, top and bottom. Clamped at 30 because below
      that a photograph is a smudge and the initial is unreadable, and at 64
      because past it the number stops being the loudest thing.
    */
    val faceDp = (height.value - 28f).coerceIn(30f, 64f).toInt()

    val face = @Composable { photo: Bitmap?, colour: Int, name: String ->
        Image(
            provider = ImageProvider(
                avatarBitmap(
                    photo = photo,
                    accent = colour,
                    initial = name,
                    sizePx = faceDp * 3,
                    // Faded when there is nothing to show, which is the same
                    // signal the old locked mark gave without a second layout.
                    alpha = if (title == null) 150 else 255,
                ),
            ),
            contentDescription = name,
            modifier = GlanceModifier.width(faceDp.dp).height(faceDp.dp),
        )
    }

    /*
      Locked and unlocked share a layout on purpose. A widget that still shows
      two faces is worth keeping on a home screen while you decide; three lines
      of grey text is what gets dragged to the bin — and with location off by
      default, this is the state most people meet first.
    */
    val heading = title ?: "—"

    Shell(from = tint(snapshot.theirAccent)) {
        Row(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            face(mine, snapshot.myAccent, snapshot.myName)

            /*
              `defaultWeight` is what pushes the two faces to the ends: the
              middle takes every pixel neither of them wanted. That is the whole
              layout, and it is why this needs no size branch of its own.
            */
            Column(
                modifier = GlanceModifier.defaultWeight(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Counter(
                    text = heading,
                    size = when {
                        heading.length > 9 -> 17
                        heading.length > 6 -> 22
                        else -> 28
                    },
                    color = accent,
                )

                /*
                  The note survives only where it is still telling you
                  something. With a real reading between two faces it repeated
                  the number back — "km from Sansu Baby" under "800 km" — and
                  the request was to stop wasting the room on it. When location
                  is off it is the only thing on the widget that says why.
                */
                if (title == null && height >= 84.dp) {
                    Spacer(modifier = GlanceModifier.height(4.dp))
                    Headline(
                        text = if (snapshot.paired) "Both of you turn it on" else "Pair first",
                        size = 11,
                        color = Ash,
                        maxLines = 1,
                    )
                }
            }

            face(theirs, snapshot.theirAccent, snapshot.theirName)
        }
    }
}

/** Exposed for the daily rollover check; keeps `LocalDate` out of the widgets. */
internal fun today(): LocalDate = LocalDate.now()
