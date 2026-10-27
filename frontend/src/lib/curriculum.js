// "Mavzular": every subtopic carries a ready problem that opens a full lesson (idea, steps, variations, practice).
// q is LaTeX (language independent) or {uz, ru, en} for word problems.
export const pick = (q, lang) => (typeof q === 'string' ? q : q[lang] || q.en)

export const CURRICULUM = [
  { id: 'quadratic', icon: '📐', color: 'from-indigo-500 to-violet-500', name: { uz: 'Kvadrat tenglamalar', ru: 'Квадратные уравнения', en: 'Quadratic equations' },
    subs: [
      { lv: 'easy', name: { uz: 'Diskriminant usuli', ru: 'Через дискриминант', en: 'The discriminant method' }, q: 'x^2 - 5x + 6 = 0' },
      { lv: 'easy', name: { uz: 'Viyet teoremasi', ru: 'Теорема Виета', en: 'Vieta\'s formulas' }, q: 'x^2 + 3x - 10 = 0' },
      { lv: 'medium', name: { uz: 'To‘liq bo‘lmagan tenglama', ru: 'Неполные уравнения', en: 'Incomplete equations' }, q: '3x^2 - 12 = 0' },
      { lv: 'hard', name: { uz: 'Parametrli tenglama', ru: 'Уравнение с параметром', en: 'Equation with a parameter' }, q: 'x^2 - ax + 4 = 0' },
    ] },
  { id: 'derivative', icon: '📈', color: 'from-rose-500 to-orange-400', name: { uz: 'Hosila', ru: 'Производная', en: 'Derivatives' },
    subs: [
      { lv: 'easy', name: { uz: 'Daraja funksiya hosilasi', ru: 'Производная степенной функции', en: 'Power rule' }, q: "f(x) = x^3 - 3x^2 + 2x,\\ f'(x)" },
      { lv: 'medium', name: { uz: 'Ko‘paytma hosilasi', ru: 'Производная произведения', en: 'Product rule' }, q: "f(x) = (x^2 + 1)\\sin x,\\ f'(x)" },
      { lv: 'hard', name: { uz: 'Murakkab funksiya', ru: 'Сложная функция', en: 'Chain rule' }, q: "f(x) = (3x + 1)^5,\\ f'(x)" },
    ] },
  { id: 'fractions', icon: '🍰', color: 'from-emerald-500 to-teal-400', name: { uz: 'Kasrlar', ru: 'Дроби', en: 'Fractions' },
    subs: [
      { lv: 'easy', name: { uz: 'Kasrlarni qo‘shish', ru: 'Сложение дробей', en: 'Adding fractions' }, q: '\\frac{2}{3} + \\frac{3}{4}' },
      { lv: 'medium', name: { uz: 'Ko‘paytirish va bo‘lish', ru: 'Умножение и деление', en: 'Multiplying and dividing' }, q: '\\frac{5}{6} \\div \\frac{10}{9}' },
      { lv: 'medium', name: { uz: 'Aralash sonlar', ru: 'Смешанные числа', en: 'Mixed numbers' }, q: '2\\frac{1}{3} + 1\\frac{3}{4}' },
    ] },
  { id: 'trig', icon: '🌊', color: 'from-sky-500 to-cyan-400', name: { uz: 'Trigonometriya', ru: 'Тригонометрия', en: 'Trigonometry' },
    subs: [
      { lv: 'easy', name: { uz: 'Qiymatlarni hisoblash', ru: 'Вычисление значений', en: 'Evaluating values' }, q: '\\sin 30^\\circ + \\cos 60^\\circ' },
      { lv: 'medium', name: { uz: 'Trigonometrik tenglama', ru: 'Тригонометрическое уравнение', en: 'Trigonometric equation' }, q: '2\\sin x - 1 = 0' },
      { lv: 'hard', name: { uz: 'Ikkilangan burchak', ru: 'Двойной угол', en: 'Double angle' }, q: '\\sin 2x = \\cos x' },
    ] },
  { id: 'matrix', icon: '🔢', color: 'from-fuchsia-500 to-pink-500', name: { uz: 'Matritsalar', ru: 'Матрицы', en: 'Matrices' },
    subs: [
      { lv: 'medium', name: { uz: 'Matritsalarni ko‘paytirish', ru: 'Умножение матриц', en: 'Multiplying matrices' }, q: '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}\\cdot\\begin{pmatrix}0&1\\\\1&0\\end{pmatrix}' },
      { lv: 'easy', name: { uz: 'Determinant', ru: 'Определитель', en: 'Determinant' }, q: '\\det\\begin{pmatrix}2&1\\\\5&3\\end{pmatrix}' },
      { lv: 'hard', name: { uz: 'Teskari matritsa', ru: 'Обратная матрица', en: 'Inverse matrix' }, q: '\\begin{pmatrix}2&1\\\\5&3\\end{pmatrix}^{-1}' },
    ] },
  { id: 'geometry', icon: '📏', color: 'from-amber-500 to-yellow-400', name: { uz: 'Geometriya', ru: 'Геометрия', en: 'Geometry' },
    subs: [
      { lv: 'easy', name: { uz: 'Pifagor teoremasi', ru: 'Теорема Пифагора', en: 'Pythagorean theorem' },
        q: { uz: 'Katetlari 3 va 4 bo‘lgan to‘g‘ri burchakli uchburchakning gipotenuzasini toping', ru: 'Найдите гипотенузу прямоугольного треугольника с катетами 3 и 4', en: 'Find the hypotenuse of a right triangle with legs 3 and 4' } },
      { lv: 'easy', name: { uz: 'Uchburchak yuzi', ru: 'Площадь треугольника', en: 'Area of a triangle' },
        q: { uz: 'Asosi 10 va balandligi 6 bo‘lgan uchburchakning yuzini toping', ru: 'Найдите площадь треугольника с основанием 10 и высотой 6', en: 'Find the area of a triangle with base 10 and height 6' } },
      { lv: 'medium', name: { uz: 'Aylana va doira', ru: 'Окружность и круг', en: 'Circle' },
        q: { uz: 'Radiusi 5 bo‘lgan aylananing uzunligini va doiraning yuzini toping', ru: 'Найдите длину окружности и площадь круга радиуса 5', en: 'Find the circumference and the area of a circle with radius 5' } },
    ] },
  { id: 'probability', icon: '🎲', color: 'from-blue-600 to-indigo-500', name: { uz: 'Ehtimollar nazariyasi', ru: 'Теория вероятностей', en: 'Probability' },
    subs: [
      { lv: 'easy', name: { uz: 'Klassik ehtimollik', ru: 'Классическая вероятность', en: 'Classical probability' },
        q: { uz: 'Bitta o‘yin kubigi tashlanganda juft son tushish ehtimolini toping', ru: 'Найдите вероятность выпадения чётного числа при броске кубика', en: 'Find the probability of rolling an even number with one die' } },
      { lv: 'medium', name: { uz: 'Kombinatorika', ru: 'Комбинаторика', en: 'Combinatorics' }, q: 'C_{10}^{3}' },
      { lv: 'medium', name: { uz: 'Bog‘liqsiz hodisalar', ru: 'Независимые события', en: 'Independent events' },
        q: { uz: 'Ikkita tanga tashlanganda ikkalasida ham gerb tushish ehtimolini toping', ru: 'Найдите вероятность, что на обеих монетах выпадет орёл', en: 'Find the probability that two coins both land heads' } },
    ] },
  { id: 'progression', icon: '🪜', color: 'from-lime-500 to-emerald-500', name: { uz: 'Progressiyalar', ru: 'Прогрессии', en: 'Progressions' },
    subs: [
      { lv: 'medium', name: { uz: 'Arifmetik progressiya', ru: 'Арифметическая прогрессия', en: 'Arithmetic progression' }, q: 'a_1 = 3,\\ d = 4,\\ a_{10} = ?,\\ S_{10} = ?' },
      { lv: 'medium', name: { uz: 'Geometrik progressiya', ru: 'Геометрическая прогрессия', en: 'Geometric progression' }, q: 'b_1 = 2,\\ q = 3,\\ b_5 = ?' },
    ] },
  { id: 'logarithm', icon: '🧮', color: 'from-purple-500 to-indigo-500', name: { uz: 'Logarifmlar', ru: 'Логарифмы', en: 'Logarithms' },
    subs: [
      { lv: 'easy', name: { uz: 'Logarifm xossalari', ru: 'Свойства логарифмов', en: 'Logarithm rules' }, q: '\\log_2 8 + \\log_3 9' },
      { lv: 'medium', name: { uz: 'Logarifmik tenglama', ru: 'Логарифмическое уравнение', en: 'Logarithmic equation' }, q: '\\log_2 (x + 1) = 3' },
    ] },
]
