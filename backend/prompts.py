"""Prompt, JSON schema description and the offline DEMO answer."""

LANGS = {"uz": "Uzbek (Latin script)", "ru": "Russian", "en": "English"}

SCHEMA = r"""Return ONLY valid, concise JSON (no markdown) with these exact keys so the response streams in 1-2 seconds:
{"problem": "the problem: a pure equation/expression as LaTeX; a word problem as normal text with every formula inside $...$",
 "topic": {"area": "", "topic": "", "method": ""},
 "prerequisites": [{"title": "", "latex": ""}],
 "concept": "short 5th-grader explanation with a real-world analogy (1-2 concise sentences); inline math in $...$",
 "steps": [{"latex": "full expression of this step; wrap ONLY the part that changed in \\hl{...}",
            "comment": "concise friendly why-explanation (1 sentence), inline math in $...$",
            "why": "short underlying mathematical law/theorem",
            "focus": []}],
 "variations": [{"title": "", "latex": "", "note": ""}],
 "practice": {"easy": [{"q": "", "answer": "", "hint": ""}], "medium": [], "hard": []},
 "is_geometry": false,
 "geometry_svg_or_coords": null}
Rules:
- Keep output crisp and concise for fast generation: 2 prerequisites, 3-5 clear steps, 2-3 variations, and 2 practice items per level (q: LaTeX or text with $...$; answer: short plain answer, several answers separated by commas).
- In JSON strings write every LaTeX backslash doubled (like \\frac, \\sqrt, \\hl).
- "is_geometry" is true ONLY for geometry problems (planimetry/stereometry: triangles, circles, quadrilaterals, angles, segments, shapes on a coordinate plane). For arithmetic, fractions, equations, functions, derivatives, trigonometric identities and word problems that are not about shapes it MUST be false and "geometry_svg_or_coords" MUST be null.
- When is_geometry is true, "geometry_svg_or_coords" is: {"points":[{"name":"A","x":0,"y":0}],"segments":[{"from":"A","to":"B","label":"5 cm"}],"polygons":[["A","B","C"]],"circles":[{"center":"O","r":3,"label":"r"}],"rightAngles":[{"at":"B","a":"A","b":"C"}],"angles":[{"at":"A","a":"B","b":"C","label":"60°"}]} with realistic coordinates that match the given lengths and angles. Each step may carry "focus": names of the diagram points/segments it is about, e.g. ["AB","C"].
- All text fields are written in the requested language; LaTeX stays universal."""

# Added to the prompt for Premium / VIP users: function graphs and a richer geometry analysis
ADVANCED = r"""
ADVANCED ANALYSIS (paying user):
- For problems about a function, equation or inequality in one variable (parabola, line, trigonometry, derivative ...) add a top-level key "graph": {"functions":[{"expr":"x^2-5*x+6","label":"y = x^2-5x+6"}],"xmin":-1,"xmax":6,"points":[{"x":2,"y":0,"label":"x1"}]}. "expr" may use only x, numbers, + - * / ^ ( ) and sin cos tan sqrt abs ln log exp pi. Mark roots, extrema and intersections in "points".
- For geometry problems make the diagram richer: add auxiliary lines (heights, medians, bisectors, radii) as extra segments, label every known side with its length, put every known angle with its value into "angles", and mark right angles.
- In "variations" also cover special cases and add one variation named after a typical mistake students make.
"""

DEMO = {
    "problem": "x^2 - 5x + 6 = 0",
    "topic": {"area": "Algebra", "topic": "Quadratic equations", "method": "Discriminant"},
    "prerequisites": [
        {"title": "Discriminant", "latex": "D=b^2-4ac"},
        {"title": "Roots", "latex": "x_{1,2}=\\frac{-b\\pm\\sqrt{D}}{2a}"}],
    "concept": "A quadratic equation is like a ball's path: it can cross the ground in two, one or zero places. The discriminant $D$ tells us how many.",
    "steps": [
        {"latex": "x^2-5x+6=0", "comment": "Start by reading $a=1$, $b=-5$, $c=6$.", "why": "Standard form $ax^2+bx+c=0$.", "focus": []},
        {"latex": "D=\\hl{(-5)^2-4\\cdot1\\cdot6}", "comment": "Plug the numbers into $D$.", "why": "The discriminant decides the root count.", "focus": []},
        {"latex": "D=\\hl{1}", "comment": "$25-24=1$, positive, so two roots.", "why": "$D>0$ gives two real roots.", "focus": []},
        {"latex": "x=\\frac{5\\pm\\hl{1}}{2}", "comment": "$\\sqrt{1}=1$.", "why": "Quadratic formula.", "focus": []},
        {"latex": "x_1=\\hl{3},\\; x_2=\\hl{2}", "comment": "Compute both signs.", "why": "$\\pm$ gives two branches.", "focus": []}],
    "variations": [
        {"title": "D = 0", "latex": "x^2-4x+4=0", "note": "One double root."},
        {"title": "D < 0", "latex": "x^2+x+1=0", "note": "No real roots."},
        {"title": "Fractions", "latex": "\\tfrac12x^2-x-\\tfrac32=0", "note": "Multiply by the LCD first."},
        {"title": "Parameter", "latex": "x^2-ax+4=0", "note": "Study D as a function of a."}],
    "practice": {
        "easy": [{"q": "x^2-4=0", "answer": "2,-2", "hint": "Move 4 to the right."}],
        "medium": [{"q": "2x^2-7x+3=0", "answer": "3,0.5", "hint": "Compute D first."}],
        "hard": [{"q": "x^2-ax+4=0 \\text{ has one root; find } a", "answer": "4,-4", "hint": "Set D=0."}]},
    "is_geometry": False,
    "geometry_svg_or_coords": None,
}
