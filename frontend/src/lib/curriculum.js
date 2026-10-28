// "Mavzular": every category has key formulas (cheat-sheet) + worked example, and every subtopic has a ready problem.
export const pick = (q, lang) => (typeof q === 'string' ? q : q[lang] || q.en)

export const CURRICULUM = [
  {
    id: 'quadratic',
    icon: '📐',
    color: 'from-indigo-500 to-violet-500',
    name: { uz: 'Kvadrat tenglamalar', ru: 'Квадратные уравнения', en: 'Quadratic equations' },
    desc: {
      uz: '$ax^2 + bx + c = 0$ ($a \\ne 0$) ko‘rinishidagi ikkinchi darajali tenglamalar va ularni diskriminant hamda Viyet teoremasi yordamida yechish.',
      ru: 'Уравнения вида $ax^2 + bx + c = 0$ ($a \\ne 0$), решаемые через дискриминант и теорему Виета.',
      en: 'Second-degree equations of the form $ax^2 + bx + c = 0$ ($a \\ne 0$), solved via the discriminant and Vieta’s formulas.',
    },
    formulas: [
      { label: { uz: 'Umumiy ko‘rinish', ru: 'Общий вид', en: 'Standard form' }, tex: 'ax^2 + bx + c = 0' },
      { label: { uz: 'Diskriminant', ru: 'Дискриминант', en: 'Discriminant' }, tex: 'D = b^2 - 4ac' },
      { label: { uz: 'Ildizlar formulasi', ru: 'Корни уравнения', en: 'Quadratic formula' }, tex: 'x_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}' },
      { label: { uz: 'Viyet teoremasi', ru: 'Теорема Виета', en: 'Vieta’s formulas' }, tex: 'x_1 + x_2 = -\\frac{b}{a},\\quad x_1 \\cdot x_2 = \\frac{c}{a}' },
    ],
    example: {
      problem: 'x^2 - 5x + 6 = 0',
      steps: [
        { tex: 'a = 1,\\; b = -5,\\; c = 6', note: { uz: 'Koeffitsiyentlarni aniqlaymiz', ru: 'Выписываем коэффициенты', en: 'Identify the coefficients' } },
        { tex: 'D = (-5)^2 - 4 \\cdot 1 \\cdot 6 = 25 - 24 = 1', note: { uz: 'Diskriminantni hisoblaymiz ($D > 0$)', ru: 'Находим дискриминант ($D > 0$)', en: 'Compute the discriminant ($D > 0$)' } },
        { tex: 'x_{1,2} = \\frac{5 \\pm \\sqrt{1}}{2} \\implies x_1 = 3,\\; x_2 = 2', note: { uz: 'Ikkala haqiqiy ildizni topamiz', ru: 'Находим оба корня', en: 'Find both real roots' } },
      ],
    },
    subs: [
      { lv: 'easy', name: { uz: 'Diskriminant usuli', ru: 'Через дискриминант', en: 'The discriminant method' }, q: 'x^2 - 5x + 6 = 0' },
      { lv: 'easy', name: { uz: 'Viyet teoremasi', ru: 'Теорема Виета', en: "Vieta's formulas" }, q: 'x^2 + 3x - 10 = 0' },
      { lv: 'medium', name: { uz: 'To‘liq bo‘lmagan tenglama', ru: 'Неполные уравнения', en: 'Incomplete equations' }, q: '3x^2 - 12 = 0' },
      { lv: 'hard', name: { uz: 'Parametrli tenglama', ru: 'Уравнение с параметром', en: 'Equation with a parameter' }, q: 'x^2 - ax + 4 = 0' },
    ],
  },
  {
    id: 'derivative',
    icon: '📈',
    color: 'from-rose-500 to-orange-400',
    name: { uz: 'Hosila', ru: 'Производная', en: 'Derivatives' },
    desc: {
      uz: 'Funksiyaning o‘zgarish tezligi, urinma burchak koeffitsiyenti va ekstremum nuqtalarni topish qoidalari.',
      ru: 'Скорость изменения функции, правила дифференцирования и нахождение экстремумов.',
      en: 'Rate of change of a function, differentiation rules, and finding local extrema.',
    },
    formulas: [
      { label: { uz: 'Daraja qoidasi', ru: 'Степенная функция', en: 'Power rule' }, tex: "(x^n)' = n \\cdot x^{n-1}" },
      { label: { uz: 'Ko‘paytma hosilasi', ru: 'Производная произведения', en: 'Product rule' }, tex: "(u \\cdot v)' = u'v + uv'" },
      { label: { uz: 'Bo‘linma hosilasi', ru: 'Производная частного', en: 'Quotient rule' }, tex: "\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^2}" },
      { label: { uz: 'Murakkab funksiya', ru: 'Сложная функция', en: 'Chain rule' }, tex: "(f(g(x)))' = f'(g(x)) \\cdot g'(x)" },
    ],
    example: {
      problem: "f(x) = x^3 - 3x^2 + 2x,\\quad f'(x) = ?",
      steps: [
        { tex: "f'(x) = (x^3)' - 3(x^2)' + 2(x)'", note: { uz: 'Har bir hadning hosilasini olamiz', ru: 'Дифференцируем почленно', en: 'Differentiate term by term' } },
        { tex: "f'(x) = 3x^2 - 6x + 2", note: { uz: "$(x^n)' = nx^{n-1}$ qoidasini qo‘llaymiz", ru: 'Применяем правило степени', en: 'Apply the power rule' } },
      ],
    },
    subs: [
      { lv: 'easy', name: { uz: 'Daraja funksiya hosilasi', ru: 'Производная степенной функции', en: 'Power rule' }, q: "f(x) = x^3 - 3x^2 + 2x,\\ f'(x)" },
      { lv: 'medium', name: { uz: 'Ko‘paytma hosilasi', ru: 'Производная произведения', en: 'Product rule' }, q: "f(x) = (x^2 + 1)\\sin x,\\ f'(x)" },
      { lv: 'hard', name: { uz: 'Murakkab funksiya', ru: 'Сложная функция', en: 'Chain rule' }, q: "f(x) = (3x + 1)^5,\\ f'(x)" },
    ],
  },
  {
    id: 'fractions',
    icon: '🍰',
    color: 'from-emerald-500 to-teal-400',
    name: { uz: 'Kasrlar', ru: 'Дроби', en: 'Fractions' },
    desc: {
      uz: 'Oddiy va aralash kasrlarni umumiy maxrajga keltirish, qo‘shish, ayirish, ko‘paytirish va bo‘lish.',
      ru: 'Приведение дробей к общему знаменателю, сложение, вычитание, умножение и деление.',
      en: 'Common denominators, adding, subtracting, multiplying, and dividing fractions and mixed numbers.',
    },
    formulas: [
      { label: { uz: 'Qo‘shish va ayirish', ru: 'Сложение и вычитание', en: 'Addition & subtraction' }, tex: '\\frac{a}{b} \\pm \\frac{c}{d} = \\frac{ad \\pm bc}{bd}' },
      { label: { uz: 'Ko‘paytirish', ru: 'Умножение', en: 'Multiplication' }, tex: '\\frac{a}{b} \\cdot \\frac{c}{d} = \\frac{a \\cdot c}{b \\cdot d}' },
      { label: { uz: 'Bo‘lish', ru: 'Деление', en: 'Division' }, tex: '\\frac{a}{b} \\div \\frac{c}{d} = \\frac{a}{b} \\cdot \\frac{d}{c}' },
    ],
    example: {
      problem: '\\frac{2}{3} + \\frac{3}{4}',
      steps: [
        { tex: '\\text{EKUK}(3, 4) = 12', note: { uz: 'Umumiy maxraj $12$ ni topamiz', ru: 'Находим общий знаменатель $12$', en: 'Find the least common denominator $12$' } },
        { tex: '\\frac{2 \\cdot 4}{12} + \\frac{3 \\cdot 3}{12} = \\frac{8 + 9}{12} = \\frac{17}{12} = 1\\frac{5}{12}', note: { uz: 'Suratlarini qo‘shamiz va aralash songa o‘tkazamiz', ru: 'Складываем числители', en: 'Add numerators and simplify' } },
      ],
    },
    subs: [
      { lv: 'easy', name: { uz: 'Kasrlarni qo‘shish', ru: 'Сложение дробей', en: 'Adding fractions' }, q: '\\frac{2}{3} + \\frac{3}{4}' },
      { lv: 'medium', name: { uz: 'Ko‘paytirish va bo‘lish', ru: 'Умножение и деление', en: 'Multiplying and dividing' }, q: '\\frac{5}{6} \\div \\frac{10}{9}' },
      { lv: 'medium', name: { uz: 'Aralash sonlar', ru: 'Смешанные числа', en: 'Mixed numbers' }, q: '2\\frac{1}{3} + 1\\frac{3}{4}' },
    ],
  },
  {
    id: 'trig',
    icon: '🌊',
    color: 'from-sky-500 to-cyan-400',
    name: { uz: 'Trigonometriya', ru: 'Тригонометрия', en: 'Trigonometry' },
    desc: {
      uz: 'Trigonometrik funksiyalar, asosiy ayniyatlar, ikkilangan burchak formulalari va tenglamalar.',
      ru: 'Тригонометрические функции, основные тождества, формулы двойного угла и уравнения.',
      en: 'Trigonometric functions, fundamental identities, double-angle formulas, and equations.',
    },
    formulas: [
      { label: { uz: 'Asosiy ayniyat', ru: 'Основное тождество', en: 'Pythagorean identity' }, tex: '\\sin^2 x + \\cos^2 x = 1' },
      { label: { uz: 'Tangens va kotangens', ru: 'Тангенс и котангенс', en: 'Tangent & cotangent' }, tex: '\\tan x = \\frac{\\sin x}{\\cos x},\\quad \\cot x = \\frac{\\cos x}{\\sin x}' },
      { label: { uz: 'Ikkilangan burchak', ru: 'Двойной угол', en: 'Double angle' }, tex: '\\sin 2x = 2\\sin x \\cos x,\\quad \\cos 2x = \\cos^2 x - \\sin^2 x' },
    ],
    example: {
      problem: '\\sin 30^\\circ + \\cos 60^\\circ',
      steps: [
        { tex: '\\sin 30^\\circ = \\frac{1}{2},\\quad \\cos 60^\\circ = \\frac{1}{2}', note: { uz: 'Jadval qiymatlarini qo‘yamiz', ru: 'Подставляем табличные значения', en: 'Substitute standard angle values' } },
        { tex: '\\frac{1}{2} + \\frac{1}{2} = 1', note: { uz: 'Yig‘indini hisoblaymiz', ru: 'Вычисляем сумму', en: 'Add the values' } },
      ],
    },
    subs: [
      { lv: 'easy', name: { uz: 'Qiymatlarni hisoblash', ru: 'Вычисление значений', en: 'Evaluating values' }, q: '\\sin 30^\\circ + \\cos 60^\\circ' },
      { lv: 'medium', name: { uz: 'Trigonometrik tenglama', ru: 'Тригонометрическое уравнение', en: 'Trigonometric equation' }, q: '2\\sin x - 1 = 0' },
      { lv: 'hard', name: { uz: 'Ikkilangan burchak', ru: 'Двойной угол', en: 'Double angle' }, q: '\\sin 2x = \\cos x' },
    ],
  },
  {
    id: 'matrix',
    icon: '🔢',
    color: 'from-fuchsia-500 to-pink-500',
    name: { uz: 'Matritsalar', ru: 'Матрицы', en: 'Matrices' },
    desc: {
      uz: 'Matritsalar ustida amallar, determinantni hisoblash va teskari matritsani topish.',
      ru: 'Действия над матрицами, вычисление определителя и нахождение обратной матрицы.',
      en: 'Matrix operations, computing determinants, and finding inverse matrices.',
    },
    formulas: [
      { label: { uz: 'Determinant ($2\\times 2$)', ru: 'Определитель ($2\\times 2$)', en: '2×2 Determinant' }, tex: '\\det\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix} = ad - bc' },
      { label: { uz: 'Teskari matritsa', ru: 'Обратная матрица', en: 'Inverse matrix' }, tex: 'A^{-1} = \\frac{1}{\\det A}\\begin{pmatrix}d&-b\\\\-c&a\\end{pmatrix}' },
    ],
    example: {
      problem: '\\det\\begin{pmatrix}2&1\\\\5&3\\end{pmatrix}',
      steps: [
        { tex: '\\det A = 2 \\cdot 3 - 1 \\cdot 5', note: { uz: 'Asosiy diagonal ko‘paytmasidan yordamchi diagonalni ayiramiz', ru: 'Произведение главной диагонали минус побочной', en: 'Main diagonal product minus off-diagonal product' } },
        { tex: '\\det A = 6 - 5 = 1', note: { uz: 'Natijani yozamiz', ru: 'Получаем ответ', en: 'Simplify to get the determinant' } },
      ],
    },
    subs: [
      { lv: 'medium', name: { uz: 'Matritsalarni ko‘paytirish', ru: 'Умножение матриц', en: 'Multiplying matrices' }, q: '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}\\cdot\\begin{pmatrix}0&1\\\\1&0\\end{pmatrix}' },
      { lv: 'easy', name: { uz: 'Determinant', ru: 'Определитель', en: 'Determinant' }, q: '\\det\\begin{pmatrix}2&1\\\\5&3\\end{pmatrix}' },
      { lv: 'hard', name: { uz: 'Teskari matritsa', ru: 'Обратная матрица', en: 'Inverse matrix' }, q: '\\begin{pmatrix}2&1\\\\5&3\\end{pmatrix}^{-1}' },
    ],
  },
  {
    id: 'geometry',
    icon: '📏',
    color: 'from-amber-500 to-yellow-400',
    name: { uz: 'Geometriya', ru: 'Геометрия', en: 'Geometry' },
    desc: {
      uz: 'Uchburchaklar, Pifagor teoremasi, aylana uzunligi va tekis shakllar yuzini hisoblash.',
      ru: 'Треугольники, теорема Пифагора, длина окружности и площади плоских фигур.',
      en: 'Triangles, Pythagorean theorem, circle circumference, and areas of planar figures.',
    },
    formulas: [
      { label: { uz: 'Pifagor teoremasi', ru: 'Теорема Пифагора', en: 'Pythagorean theorem' }, tex: 'a^2 + b^2 = c^2' },
      { label: { uz: 'Uchburchak yuzi', ru: 'Площадь треугольника', en: 'Triangle area' }, tex: 'S = \\frac{1}{2} a \\cdot h' },
      { label: { uz: 'Aylana va doira', ru: 'Окружность и круг', en: 'Circle formulas' }, tex: 'L = 2\\pi r,\\quad S = \\pi r^2' },
    ],
    example: {
      problem: 'a = 3,\\; b = 4 \\implies c = ?',
      steps: [
        { tex: 'c = \\sqrt{a^2 + b^2} = \\sqrt{3^2 + 4^2}', note: { uz: 'Pifagor teoremasini qo‘llaymiz', ru: 'Применяем теорему Пифагора', en: 'Apply the Pythagorean theorem' } },
        { tex: 'c = \\sqrt{9 + 16} = \\sqrt{25} = 5', note: { uz: 'Gipotenuza $5$ ga teng', ru: 'Гипотенуза равна $5$', en: 'Hypotenuse equals $5$' } },
      ],
    },
    subs: [
      { lv: 'easy', name: { uz: 'Pifagor teoremasi', ru: 'Теорема Пифагора', en: 'Pythagorean theorem' },
        q: { uz: 'Katetlari 3 va 4 bo‘lgan to‘g‘ri burchakli uchburchakning gipotenuzasini toping', ru: 'Найдите гипотенузу прямоугольного треугольника с катетами 3 и 4', en: 'Find the hypotenuse of a right triangle with legs 3 and 4' } },
      { lv: 'easy', name: { uz: 'Uchburchak yuzi', ru: 'Площадь треугольника', en: 'Area of a triangle' },
        q: { uz: 'Asosi 10 va balandligi 6 bo‘lgan uchburchakning yuzini toping', ru: 'Найдите площадь треугольника с основанием 10 и высотой 6', en: 'Find the area of a triangle with base 10 and height 6' } },
      { lv: 'medium', name: { uz: 'Aylana va doira', ru: 'Окружность и круг', en: 'Circle' },
        q: { uz: 'Radiusi 5 bo‘lgan aylananing uzunligini va doiraning yuzini toping', ru: 'Найдите длину окружности и площадь круга радиуса 5', en: 'Find the circumference and the area of a circle with radius 5' } },
    ],
  },
  {
    id: 'probability',
    icon: '🎲',
    color: 'from-blue-600 to-indigo-500',
    name: { uz: 'Ehtimollar nazariyasi', ru: 'Теория вероятностей', en: 'Probability' },
    desc: {
      uz: 'Klassik ehtimollik, kombinatorika (guruhlash va o‘rinlashtirish) hamda bog‘liqsiz hodisalar.',
      ru: 'Классическая вероятность, комбинаторика и независимые события.',
      en: 'Classical probability, combinatorics (combinations & permutations), and independent events.',
    },
    formulas: [
      { label: { uz: 'Klassik ehtimollik', ru: 'Классическая вероятность', en: 'Classical probability' }, tex: 'P(A) = \\frac{m}{n}' },
      { label: { uz: 'Kombinatsiya', ru: 'Сочетания', en: 'Combinations' }, tex: 'C_n^k = \\frac{n!}{k!(n-k)!}' },
      { label: { uz: 'Bog‘liqsiz hodisalar', ru: 'Независимые события', en: 'Independent events' }, tex: 'P(A \\cap B) = P(A) \\cdot P(B)' },
    ],
    example: {
      problem: 'C_{10}^{3}',
      steps: [
        { tex: 'C_{10}^{3} = \\frac{10!}{3! \\cdot 7!} = \\frac{10 \\cdot 9 \\cdot 8}{3 \\cdot 2 \\cdot 1}', note: { uz: 'Kombinatsiya formulasiga qo‘yamiz', ru: 'Подставляем в формулу сочетаний', en: 'Apply the combinations formula' } },
        { tex: 'C_{10}^{3} = 10 \\cdot 3 \\cdot 4 = 120', note: { uz: 'Qisqartirib hisoblaymiz', ru: 'Сокращаем и вычисляем', en: 'Simplify and multiply' } },
      ],
    },
    subs: [
      { lv: 'easy', name: { uz: 'Klassik ehtimollik', ru: 'Классическая вероятность', en: 'Classical probability' },
        q: { uz: 'Bitta o‘yin kubigi tashlanganda juft son tushish ehtimolini toping', ru: 'Найдите вероятность выпадения чётного числа при броске кубика', en: 'Find the probability of rolling an even number with one die' } },
      { lv: 'medium', name: { uz: 'Kombinatorika', ru: 'Комбинаторика', en: 'Combinatorics' }, q: 'C_{10}^{3}' },
      { lv: 'medium', name: { uz: 'Bog‘liqsiz hodisalar', ru: 'Независимые события', en: 'Independent events' },
        q: { uz: 'Ikkita tanga tashlanganda ikkalasida ham gerb tushish ehtimolini toping', ru: 'Найдите вероятность, что на обеих монетах выпадет орёл', en: 'Find the probability that two coins both land heads' } },
    ],
  },
  {
    id: 'progression',
    icon: '🪜',
    color: 'from-lime-500 to-emerald-500',
    name: { uz: 'Progressiyalar', ru: 'Прогрессии', en: 'Progressions' },
    desc: {
      uz: 'Arifmetik va geometrik progressiyalarning $n$-hadi hamda dastlabki $n$ ta hadi yig‘indisi.',
      ru: 'Формулы $n$-го члена и суммы первых $n$ членов арифметической и геометрической прогрессий.',
      en: 'Nth term and sum formulas for arithmetic and geometric progressions.',
    },
    formulas: [
      { label: { uz: 'Arifmetik progressiya', ru: 'Арифметическая прогрессия', en: 'Arithmetic progression' }, tex: 'a_n = a_1 + (n-1)d,\\quad S_n = \\frac{a_1 + a_n}{2} \\cdot n' },
      { label: { uz: 'Geometrik progressiya', ru: 'Геометрическая прогрессия', en: 'Geometric progression' }, tex: 'b_n = b_1 \\cdot q^{n-1},\\quad S_n = \\frac{b_1(q^n - 1)}{q - 1}' },
    ],
    example: {
      problem: 'a_1 = 3,\\; d = 4,\\; a_{10} = ?',
      steps: [
        { tex: 'a_{10} = a_1 + 9d = 3 + 9 \\cdot 4', note: { uz: '$a_n = a_1 + (n-1)d$ formulasini qo‘llaymiz', ru: 'Используем формулу $n$-го члена', en: 'Use the nth term formula' } },
        { tex: 'a_{10} = 3 + 36 = 39', note: { uz: '10-had qiymati $39$', ru: '10-й член равен $39$', en: 'The 10th term is $39$' } },
      ],
    },
    subs: [
      { lv: 'medium', name: { uz: 'Arifmetik progressiya', ru: 'Арифметическая прогрессия', en: 'Arithmetic progression' }, q: 'a_1 = 3,\\ d = 4,\\ a_{10} = ?,\\ S_{10} = ?' },
      { lv: 'medium', name: { uz: 'Geometrik progressiya', ru: 'Геометрическая прогрессия', en: 'Geometric progression' }, q: 'b_1 = 2,\\ q = 3,\\ b_5 = ?' },
    ],
  },
  {
    id: 'logarithm',
    icon: '🧮',
    color: 'from-purple-500 to-indigo-500',
    name: { uz: 'Logarifmlar', ru: 'Логарифмы', en: 'Logarithms' },
    desc: {
      uz: 'Logarifm ta’rifi, asosiy xossalari va logarifmik tenglamalarni yechish usullari.',
      ru: 'Определение логарифма, основные свойства и решение логарифмических уравнений.',
      en: 'Definition of logarithms, key logarithm laws, and solving logarithmic equations.',
    },
    formulas: [
      { label: { uz: 'Logarifm ta’rifi', ru: 'Определение', en: 'Definition' }, tex: '\\log_a b = c \\iff a^c = b' },
      { label: { uz: 'Ko‘paytma va bo‘linma', ru: 'Сумма и разность', en: 'Product & quotient' }, tex: '\\log_a(xy) = \\log_a x + \\log_a y,\\quad \\log_a\\frac{x}{y} = \\log_a x - \\log_a y' },
      { label: { uz: 'Daraja xossasi', ru: 'Степень под логарифмом', en: 'Power rule' }, tex: '\\log_a(x^k) = k\\log_a x' },
    ],
    example: {
      problem: '\\log_2 8 + \\log_3 9',
      steps: [
        { tex: '\\log_2(2^3) + \\log_3(3^2) = 3 + 2', note: { uz: '$8 = 2^3$ va $9 = 3^2$ ekanligidan foydalanamiz', ru: 'Представляем $8 = 2^3$ и $9 = 3^2$', en: 'Rewrite $8 = 2^3$ and $9 = 3^2$' } },
        { tex: '3 + 2 = 5', note: { uz: 'Natija $5$', ru: 'Ответ $5$', en: 'Sum equals $5$' } },
      ],
    },
    subs: [
      { lv: 'easy', name: { uz: 'Logarifm xossalari', ru: 'Свойства логарифмов', en: 'Logarithm rules' }, q: '\\log_2 8 + \\log_3 9' },
      { lv: 'medium', name: { uz: 'Logarifmik tenglama', ru: 'Логарифмическое уравнение', en: 'Logarithmic equation' }, q: '\\log_2 (x + 1) = 3' },
    ],
  },
]
