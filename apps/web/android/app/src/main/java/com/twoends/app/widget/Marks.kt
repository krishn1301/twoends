package com.twoends.app.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import androidx.core.graphics.ColorUtils

/**
 * The marks: faces, and the shapes drawn between them.
 *
 * `packages/ui/src/media.tsx` opens with the rule this whole app was designed
 * around — every screen puts "a face, a photograph or a hand-made mark" in front
 * of you. The widgets were the one surface where that never happened, because
 * nothing on the native side had ever been given a photograph of anybody. They
 * were text on black, and they looked it.
 *
 * Everything here is drawn into a single bitmap rather than composed from Glance
 * nodes, for two reasons that both matter. Glance cannot express these layouts
 * at all before API 31: there is no offset modifier that puts a heart *on* the
 * line between two siblings, and `Box` alignment is far too coarse. And a
 * RemoteViews tree crosses a Binder transaction, so five nodes carrying three
 * bitmaps costs more than one node carrying one. `weekStrip` in CountWidgets
 * made the same call for the same reason.
 *
 * What is *not* drawn here is text, beyond a single initial. Text baked into a
 * bitmap ignores the system font-size setting and is invisible to TalkBack, so
 * every word on a widget stays a Glance `Text`. The initial is the exception
 * because the image it sits in carries the person's name as its content
 * description — it repeats information rather than being the only copy of it.
 */

// ── colour ───────────────────────────────────────────────────────────────────

/**
 * Two accents screened together: `1-(1-a)(1-b)` per channel.
 *
 * The identical formula and the identical intent as `scripts/icons.mjs` — light
 * is what you get when both are present, which is the launcher mark's whole
 * argument and the reason the overlap there is brighter than either disc. The
 * two must be changed together; this comment is the only thing joining them.
 */
fun lens(a: Int, b: Int): Int {
    fun screen(x: Int, y: Int) = 255 - (255 - x) * (255 - y) / 255
    return android.graphics.Color.rgb(
        screen(android.graphics.Color.red(a), android.graphics.Color.red(b)),
        screen(android.graphics.Color.green(a), android.graphics.Color.green(b)),
        screen(android.graphics.Color.blue(a), android.graphics.Color.blue(b)),
    )
}

// ── a face ───────────────────────────────────────────────────────────────────

/**
 * One person, as a circle.
 *
 * The photograph when there is one, and their colour with the first letter of
 * their name when there is not — which is `Avatar` in `media.tsx`, ported. The
 * accent disc stays underneath the photo rather than being replaced by it, so a
 * transparent PNG shows their colour instead of a hole, exactly as it does in
 * the app.
 *
 * The fallback lives here rather than being rendered in the WebView and pushed
 * across, and that is deliberate. A missing file on this side is unambiguous —
 * there is no photo, draw the letter. If the fallback were pushed, a failed push
 * would leave the *previous* face on screen, which is a worse lie than a letter.
 */
fun avatarBitmap(
    photo: Bitmap?,
    accent: Int,
    initial: String,
    sizePx: Int,
    ring: Int = 0,
    ringPx: Float = 0f,
    alpha: Int = 255,
): Bitmap {
    val size = sizePx.coerceIn(1, 512)
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val radius = size / 2f

    // The same gradient the app uses: the accent, falling 42% toward the warm
    // near-black. Matching it is what makes a widget and a screen read as one
    // product rather than two things that happen to share a palette.
    paint.shader = LinearGradient(
        0f, 0f, size.toFloat(), size.toFloat(),
        accent, ColorUtils.blendARGB(accent, 0xFF241A17.toInt(), 0.58f),
        Shader.TileMode.CLAMP,
    )
    canvas.drawCircle(radius, radius, radius, paint)
    paint.shader = null

    if (photo != null) {
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        canvas.drawBitmap(
            photo,
            centreCrop(photo, size, size),
            RectF(0f, 0f, size.toFloat(), size.toFloat()),
            paint,
        )
        paint.xfermode = null
    } else if (initial.isNotEmpty()) {
        paint.color = 0xF2FFFFFF.toInt()
        paint.textAlign = Paint.Align.CENTER
        paint.textSize = size * 0.42f
        paint.typeface = Typeface.DEFAULT_BOLD

        // Centred on the glyph, not on the line box. Using `radius` as the
        // baseline puts the letter visibly low in the circle.
        val metrics = paint.fontMetrics
        canvas.drawText(
            initial.take(1).uppercase(),
            radius,
            radius - (metrics.ascent + metrics.descent) / 2f,
            paint,
        )
    }

    if (ringPx > 0f) {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = ringPx
        paint.color = ring
        canvas.drawCircle(radius, radius, radius - ringPx / 2f, paint)
        paint.style = Paint.Style.FILL
    }

    if (alpha < 255) {
        val faded = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        Canvas(faded).drawBitmap(out, 0f, 0f, Paint().apply { this.alpha = alpha })
        return faded
    }

    return out
}

// ── the heart ────────────────────────────────────────────────────────────────

/**
 * A heart, built from two circles and a square rotated 45 degrees.
 *
 * Not beziers. At the sixteen to twenty-two pixels this is actually drawn at,
 * hand-placed control points either look lumpy or need re-tuning for every size;
 * three primitives unioned are exact at any size and antialias cleanly.
 *
 * Worth recording why there is a heart here at all, because `scripts/icons.mjs`
 * states the opposite position in as many words: the launcher mark is
 * deliberately *not* a heart, since every couple app on the store is one and a
 * heart says nothing about what this one does. That still holds for the mark.
 * This heart is confined to the distance widget, where it is not a logo — it is
 * the thing sitting in the gap between two people, which is the entire subject
 * of that widget.
 */
private fun heartPath(cx: Float, cy: Float, size: Float): Path {
    val path = Path()

    /*
      `WINDING`, which is the default and is what actually unions these.

      There is no `FillType.UNION` — union is a `Path.Op`, for the `path.op()`
      API, and reaching for it here compiles to nothing but a wrong guess. With
      winding fill, sub-paths wound the same way merge into one silhouette, which
      is exactly what three overlapping shapes need. Every `Direction.CW` below
      is load-bearing for that reason.
    */
    path.fillType = Path.FillType.WINDING

    val r = size / 4f
    // The two lobes sit on the upper half; the point falls `size/2` below centre.
    path.addCircle(cx - r, cy - r * 0.6f, r, Path.Direction.CW)
    path.addCircle(cx + r, cy - r * 0.6f, r, Path.Direction.CW)

    val square = Path()
    val half = r * 1.42f
    square.addRect(cx - half, cy - half, cx + half, cy + half, Path.Direction.CW)
    square.transform(Matrix().apply { setRotate(45f, cx, cy - r * 0.6f) })
    path.addPath(square)

    return path
}

// ── the pair ─────────────────────────────────────────────────────────────────

/** How the two faces relate to each other on a given widget. */
enum class MarkStyle {
    /** Separated, joined by a line, with a heart in the gap. Distance. */
    Apart,

    /** Overlapping, no heart. The launcher mark, made of faces. */
    Together,

    /** Both faded, the line dashed. Nothing is switched on yet. */
    Locked,
}

/**
 * Two people, drawn as one image.
 *
 * Three styles rather than three functions, so the family is visibly a family
 * and a change to the disc geometry cannot land on one widget and miss another.
 *
 * The `Apart` style deliberately departs from candle's, which is the app the
 * owner pointed at. Theirs overlaps the two circles Venn-style and puts the
 * heart at the intersection — which works because candle's circles hold single
 * letters. With real photographs a 22% overlap crops a face, and the faces are
 * the entire reason this exists. So distance separates them and puts the heart
 * on the line, which is how Couple Joy's distance widget does it and how the
 * owner described wanting it. `Together` keeps the overlap, where nothing is
 * being cropped by a heart and an overlap is precisely what the word means.
 */
fun pairMark(
    mine: Bitmap?,
    theirs: Bitmap?,
    myAccent: Int,
    theirAccent: Int,
    myInitial: String,
    theirInitial: String,
    widthPx: Int,
    heightPx: Int,
    style: MarkStyle,
): Bitmap {
    val (w, h) = fit(widthPx, heightPx)
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    val faded = style == MarkStyle.Locked
    val alpha = if (faded) 90 else 255
    val diameter = h
    val cy = h / 2f

    val discs = { photo: Bitmap?, accent: Int, initial: String ->
        avatarBitmap(
            photo = if (faded) null else photo,
            accent = accent,
            initial = if (faded) "" else initial,
            sizePx = diameter,
            ring = SURFACE,
            ringPx = diameter * 0.045f,
            alpha = alpha,
        )
    }

    if (style == MarkStyle.Together) {
        /*
          Overlapping by 22% of a diameter — the same ratio as the launcher mark,
          where discs of r=22 sit 22 apart on a 108 grid. Theirs goes down first
          so yours reads as the nearer of the two, matching every place in the
          app that draws you on the left.
        */
        val overlap = diameter * 0.22f
        val spread = diameter * 2 - overlap
        val left = (w - spread) / 2f

        canvas.drawBitmap(discs(theirs, theirAccent, theirInitial), left + diameter - overlap, 0f, null)
        canvas.drawBitmap(discs(mine, myAccent, myInitial), left, 0f, null)
        return out
    }

    // Apart and Locked: a disc at each end, a line between, a heart on the line.
    val leftCx = diameter / 2f
    val rightCx = w - diameter / 2f

    val heart = h * 0.62f
    val gap = if (faded) 0f else heart * 0.62f

    paint.color = 0x66948A82
    paint.strokeWidth = (h * 0.045f).coerceAtLeast(2f)
    paint.strokeCap = Paint.Cap.ROUND
    if (faded) paint.pathEffect = DashPathEffect(floatArrayOf(h * 0.09f, h * 0.09f), 0f)

    /*
      Two segments with a gap for the heart, rather than one line under a halo.

      The first version drew the line straight across and hid the middle behind a
      disc of the card's own colour. On a launcher that disc was visibly larger
      than the heart's silhouette, so what you actually saw was a dark blob with
      something pink inside it. A halo you can see is not a halo. Leaving the
      space empty needs no cover-up and cannot be mis-sized.
    */
    canvas.drawLine(leftCx + diameter * 0.5f, cy, w / 2f - gap, cy, paint)
    canvas.drawLine(w / 2f + gap, cy, rightCx - diameter * 0.5f, cy, paint)
    paint.pathEffect = null

    if (!faded) {
        paint.color = lens(myAccent, theirAccent)
        canvas.drawPath(heartPath(w / 2f, cy, heart), paint)
    }

    canvas.drawBitmap(discs(mine, myAccent, myInitial), 0f, 0f, null)
    canvas.drawBitmap(discs(theirs, theirAccent, theirInitial), (w - diameter).toFloat(), 0f, null)

    return out
}

// ── a rule ───────────────────────────────────────────────────────────────────

/**
 * How far through the wait you are.
 *
 * The countdown widget's number says how many days are left, which is a fact you
 * cannot feel. A rule filling up says the same thing in a shape, and the
 * difference between "12" and "12, and you are two thirds of the way there" is
 * the difference between a fact and a feeling.
 *
 * Candle puts a photograph behind its countdown instead. Ours cannot:
 * `countdowns.cover_path` exists in the schema and no screen has ever written
 * to it, so a photo countdown would render empty for every user in the world.
 */
fun progressRule(fraction: Float, accent: Int, widthPx: Int, heightPx: Int): Bitmap {
    val (w, h) = fit(widthPx, heightPx)
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val radius = h / 2f

    paint.color = 0x1FFFFFFF
    canvas.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), radius, radius, paint)

    // Never zero-width: a rule that has not started still has to look like a
    // rule rather than like a rendering failure.
    val filled = (w * fraction.coerceIn(0f, 1f)).coerceAtLeast(h.toFloat())
    paint.color = accent
    canvas.drawRoundRect(RectF(0f, 0f, filled, h.toFloat()), radius, radius, paint)

    return out
}
