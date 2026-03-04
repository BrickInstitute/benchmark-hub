export const SCORING_PROMPT_V1 = `You are an expert UI/UX designer evaluating a user interface screenshot.

Analyze this UI screenshot and provide scores on the following criteria, each on a scale of 1-10:

1. Visual Consistency: How consistent are the visual elements (spacing, alignment, sizes)?
2. Layout Quality: How well-organized is the overall layout? Is there clear hierarchy?
3. Typography: How well is typography used? (readability, hierarchy, font choices)
4. Color Harmony: How well do the colors work together? Is there a clear palette?
5. Whitespace Usage: Is whitespace used effectively to create breathing room?
6. Accessibility Indicators: Are there visible accessibility considerations? (contrast, size, labels)

IMPORTANT: Respond ONLY with valid JSON in the following format, no other text:
{
  "visualConsistency": <number 1-10>,
  "layoutQuality": <number 1-10>,
  "typography": <number 1-10>,
  "colorHarmony": <number 1-10>,
  "whitespaceUsage": <number 1-10>,
  "accessibilityScore": <number 1-10>,
  "overallScore": <number 1-10>,
  "feedback": "<2-3 paragraph detailed analysis in Turkish>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"]
}`;

export const SCORING_PROMPT_V2 = `You are an expert UI/UX designer and front-end developer. You are given BOTH a screenshot AND the HTML source code of a web page.

Analyze the screenshot visually AND the HTML code structurally. Use both sources to provide a thorough evaluation.

From the SCREENSHOT, evaluate:
- Visual design quality, color usage, spacing, typography rendering
- Overall aesthetic impression and visual hierarchy

From the HTML CODE, evaluate:
- Semantic HTML usage (proper heading hierarchy, semantic tags like <nav>, <main>, <article>, <section>)
- Accessibility attributes (alt texts, aria-labels, role attributes, form labels)
- CSS class naming conventions and organization (BEM, utility-first, etc.)
- Responsive design indicators (viewport meta, media queries, flexible units)
- Code quality and structure (clean markup, no excessive nesting, proper document structure)

Score on the following criteria, each on a scale of 1-10:

1. Visual Consistency: How consistent are the visual elements? (from screenshot)
2. Layout Quality: How well-organized is the layout? Does the HTML structure support good hierarchy? (both)
3. Typography: Typography quality in rendering AND proper font loading/fallbacks in code? (both)
4. Color Harmony: Color palette coherence visually AND proper CSS color management? (both)
5. Whitespace Usage: Effective use of whitespace visually AND proper spacing system in code? (both)
6. Accessibility Score: Visual accessibility (contrast, sizes) AND HTML accessibility (semantic tags, ARIA, alt texts)? (both - weight HTML analysis heavily here)

IMPORTANT: Respond ONLY with valid JSON in the following format, no other text:
{
  "visualConsistency": <number 1-10>,
  "layoutQuality": <number 1-10>,
  "typography": <number 1-10>,
  "colorHarmony": <number 1-10>,
  "whitespaceUsage": <number 1-10>,
  "accessibilityScore": <number 1-10>,
  "overallScore": <number 1-10>,
  "feedback": "<2-3 paragraph detailed analysis in Turkish covering both visual and code aspects>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"]
}`;

export const CURRENT_PROMPT_VERSION = "v2";
