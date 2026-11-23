import type { DocStyles, PageSettings } from './types'
import { DOC_THEMES } from './defaults'

export interface Template {
  id: string
  name: string
  description: string
  accent: string
  html: string
  page?: Partial<PageSettings>
  styles?: Partial<DocStyles>
  preview: string[] // lines used to draw the thumbnail
}

const today = (): string => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

const theme = (id: string): Partial<DocStyles> => {
  const t = DOC_THEMES.find((x) => x.id === id)!
  return { theme: t.id, bodyFont: t.bodyFont, headingFont: t.headingFont, headingColor: t.headingColor, accent: t.accent, textColor: t.textColor }
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank document',
    description: 'Start from scratch',
    accent: '#2f5bea',
    html: '<p></p>',
    preview: []
  },
  {
    id: 'letter',
    name: 'Letter',
    description: 'Formal letter with address block',
    accent: '#1f3b73',
    preview: ['h:Your Name', 'Street Address', 'City', '', today(), '', 'Dear Recipient,', '~', '~', '~', 'Sincerely,'],
    html: `<p data-style="no-spacing"><strong>Your Name</strong></p><p data-style="no-spacing">Street Address</p><p data-style="no-spacing">City, Postal Code</p><p data-style="no-spacing">email@example.com · +00 000 000 0000</p><p></p><p>${today()}</p><p data-style="no-spacing">Recipient Name</p><p data-style="no-spacing">Title</p><p data-style="no-spacing">Company</p><p data-style="no-spacing">Address</p><p></p><p>Dear Recipient Name,</p><p>Write the reason for your letter here. Keep the opening short and to the point so the reader knows straight away what this is about.</p><p>Use the second paragraph for the details: dates, numbers, or what you need from them. If you are including anything with the letter, mention it here.</p><p>Close with what happens next and thank them for their time.</p><p>Sincerely,</p><p></p><p>Your Name</p>`
  },
  {
    id: 'resume',
    name: 'Resume',
    description: 'Clean one-page CV',
    accent: '#0a7c86',
    styles: theme('clean'),
    page: { margins: { top: 19, bottom: 19, left: 19, right: 19 } },
    preview: ['h:YOUR NAME', 'Job title', '', 'h:Experience', '~', '~', 'h:Education', '~', 'h:Skills', '~'],
    html: `<p data-style="title" style="text-align: left">Your Name</p><p data-style="subtitle">Product Designer · City, Country · you@example.com · linkedin.com/in/you</p><h2>Profile</h2><p>Two or three sentences about who you are, what you are great at, and the kind of role you want next.</p><h2>Experience</h2><h3>Senior Role — Company Name</h3><p data-style="no-spacing"><em>Jan 2022 – Present</em></p><ul><li><p>Led a project that improved a key number by a clear amount.</p></li><li><p>Built or launched something people use, and what it achieved.</p></li><li><p>Worked with a team to deliver a result on time.</p></li></ul><h3>Previous Role — Company Name</h3><p data-style="no-spacing"><em>2019 – 2021</em></p><ul><li><p>Your most impressive achievement in this role.</p></li><li><p>Another result, ideally with a number.</p></li></ul><h2>Education</h2><h3>Degree, Subject — University</h3><p>2015 – 2019 · Honours, awards or a relevant project.</p><h2>Skills</h2><p>Skill one · Skill two · Skill three · Skill four · Languages</p>`
  },
  {
    id: 'report',
    name: 'Report',
    description: 'Cover page, contents and sections',
    accent: '#4f46e5',
    styles: theme('modern'),
    page: { footer: { left: '{title}', center: '', right: 'Page {page} of {pages}' }, differentFirstPage: true },
    preview: ['', '', 'h:REPORT TITLE', 'Subtitle', '', '', '', 'Author · Date'],
    html: `<p></p><p></p><p></p><p data-style="title">Report Title</p><p data-style="subtitle">A short description of what this report covers</p><p></p><p></p><p></p><p><strong>Prepared by:</strong> Your Name</p><p><strong>Date:</strong> ${today()}</p><div data-type="page-break"></div><div data-type="toc"></div><div data-type="page-break"></div><h1>Executive Summary</h1><p>Summarise the purpose, the key findings and your main recommendation in a few short paragraphs. Many readers only read this section.</p><h1>Introduction</h1><p>Explain the background and why this report was written.</p><h2>Scope</h2><p>Describe what is covered and what is not.</p><h1>Findings</h1><p>Present what you found. Use tables and charts where they help.</p><table><tr><th><p>Area</p></th><th><p>Result</p></th><th><p>Change</p></th></tr><tr><td><p>First area</p></td><td><p>82%</p></td><td><p>+6%</p></td></tr><tr><td><p>Second area</p></td><td><p>64%</p></td><td><p>−2%</p></td></tr></table><h1>Recommendations</h1><ol><li><p>First recommendation and why.</p></li><li><p>Second recommendation and why.</p></li></ol><h1>Conclusion</h1><p>Wrap up with the main takeaway.</p>`
  },
  {
    id: 'essay',
    name: 'Essay',
    description: 'Academic essay, double spaced',
    accent: '#8a1c1c',
    styles: { ...theme('classic'), fontSize: 12, lineHeight: 2, spaceAfter: 0 },
    page: { header: { left: '', center: '', right: 'Surname {page}' } },
    preview: ['Name', 'Instructor', 'Course', 'Date', 'h:Essay Title', '~', '~', '~', '~'],
    html: `<p>Your Name</p><p>Instructor Name</p><p>Course Name</p><p>${today()}</p><p style="text-align: center">Essay Title</p><p data-first-line="36">Begin with a hook that gets the reader's attention, then give some context and end the introduction with a clear thesis statement.</p><p data-first-line="36">Each body paragraph makes one point that supports your thesis. Start with a topic sentence, give evidence, and explain how it supports your argument.</p><p data-first-line="36">Add more body paragraphs as needed. Remember to cite your sources.</p><p data-first-line="36">In the conclusion, restate the thesis in new words and explain why it matters.</p>`
  },
  {
    id: 'notes',
    name: 'Meeting notes',
    description: 'Agenda, notes and actions',
    accent: '#d1495b',
    styles: theme('editorial'),
    preview: ['h:Meeting notes', 'Date · Attendees', 'h:Agenda', '•', '•', 'h:Action items', '☐', '☐'],
    html: `<h1>Meeting Notes</h1><p><strong>Date:</strong> ${today()}<br><strong>Attendees:</strong> Name, Name, Name</p><h2>Agenda</h2><ol><li><p>First topic</p></li><li><p>Second topic</p></li><li><p>Any other business</p></li></ol><h2>Notes</h2><ul><li><p>Key point discussed</p></li><li><p>Decision made</p></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Action — Owner — Due date</p></li><li data-type="taskItem" data-checked="false"><p>Action — Owner — Due date</p></li></ul>`
  },
  {
    id: 'assignment',
    name: 'Assignment',
    description: 'Student assignment with header',
    accent: '#1d4ed8',
    page: { header: { left: 'Student Name', center: '', right: 'Course Code' }, footer: { left: '', center: '{page}', right: '' } },
    preview: ['h:Assignment Title', 'Student · Course', 'h:Question 1', '~', '~', 'h:Question 2', '~'],
    html: `<p data-style="title">Assignment Title</p><p data-style="subtitle">Student Name · Student ID · Course · ${today()}</p><h1>Question 1</h1><p>Write your answer here.</p><h1>Question 2</h1><p>Write your answer here. Use equations where needed:</p><div data-type="block-math" data-latex="E = mc^2"></div><h1>References</h1><div data-type="bibliography"></div>`
  },
  {
    id: 'journal',
    name: 'Handwritten journal',
    description: 'Lined page for pen and ink',
    accent: '#1e293b',
    styles: theme('notebook'),
    preview: ['h:Journal', 'date', '✎', '✎', '✎'],
    html: `<h1>${today()}</h1><p>Write with your keyboard, or use the pen below.</p><div data-type="ink" data-height="620" data-bg="lines" data-strokes="[]"></div><p></p>`
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    description: 'Two-column layout',
    accent: '#a0527d',
    styles: theme('elegant'),
    preview: ['h:THE NEWSLETTER', 'Issue · Date', '~ ~', '~ ~', '~ ~'],
    html: `<p data-style="title" style="text-align: center">The Newsletter</p><p data-style="subtitle" style="text-align: center">Issue 1 · ${today()}</p><hr><div data-type="columns" data-layout="equal"><div data-type="column"><h2>Lead story</h2><p>Write the most important story first. A strong headline and a short opening paragraph will draw readers in.</p><p>Add more detail in the following paragraphs.</p></div><div data-type="column"><h2>In brief</h2><ul><li><p>Short news item</p></li><li><p>Another update</p></li><li><p>An upcoming date</p></li></ul><div data-type="box" data-variant="info"><p><strong>Tip:</strong> Use callout boxes to highlight important information.</p></div></div></div>`
  }
]
