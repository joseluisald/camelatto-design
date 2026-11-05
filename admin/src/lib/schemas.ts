import { z } from 'zod';
const text = (max = 5000) => z.string().max(max);
export const safeUrl = z.string().max(2000).refine(v => !v || /^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v), 'Use uma URL http(s) ou um caminho iniciado por /.');
export const imageUrl = z.string().max(2000).refine(v => !v || ['mobile', 'web', 'research'].includes(v) || /^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v), 'Imagem inválida.');
export const projectSchema = z.object({
  title: text(180).min(1, 'Informe o título.'), description: text(2000),
  slug: z.string().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens.'),
  displayId: text(20), category: text(100), year: text(20), contribution: text(2000),
  image: imageUrl, imageAlt: text(300), phoneImage: safeUrl.default(''),
  tags: z.array(text(100)).max(30), stages: z.array(text(100)).max(20).default([]),
  challenge: text(20000), process: text(20000), solution: text(20000), results: text(10000).default(''),
  seoTitle: text(180).default(''), seoDescription: text(500).default(''),
  externalUrl: safeUrl.default(''), gallery: z.array(z.object({ image: safeUrl, alt: text(300) })).max(40).default([]),
  status: z.enum(['draft', 'published', 'archived']), featured: z.number().int().min(1).max(3).nullable(), sortOrder: z.number().int().min(0).max(100000),
}).superRefine((p, ctx) => {
  if (p.status === 'published') for (const field of ['description', 'category', 'challenge', 'process', 'solution'] as const) if (!p[field].trim()) ctx.addIssue({ code: 'custom', path: [field], message: 'Preencha antes de publicar.' });
  if (p.featured && p.status !== 'published') ctx.addIssue({ code: 'custom', path: ['featured'], message: 'Somente projetos publicados podem ser destaque.' });
});
export type ProjectInput = z.infer<typeof projectSchema>;
const titled = { eyebrow: text(100), title: text(500) };
const navigation = z.array(z.object({ label: text(100), href: safeUrl })).max(20);
export const documents = {
  hero: z.object({ title: text(500), highlight: text(200), description: text(2000), primaryCta: text(100), secondaryCta: text(100) }),
  navigation,
  projects: z.object({ title: text(300) }),
  approach: z.object({ ...titled, description: text(2000), steps: z.array(z.object({ title: text(200), description: text(2000) })).max(20) }),
  about: z.object({ ...titled, image: safeUrl, imageAlt: text(300), paragraphs: z.array(text(5000)).max(30), skills: z.array(text(200)).max(50), stats: z.array(z.object({ value: text(100), label: text(200) })).max(10) }),
  contact: z.object({ ...titled, highlight: text(200), description: text(2000), formEnabled: z.boolean().default(true), privacyNotice: text(3000).default('Usaremos seus dados para responder ao seu contato.'), privacyVersion: text(50).default('1') }),
  gallery: z.object({ ...titled, items: z.array(z.object({ title: text(300), category: text(100), image: safeUrl, alt: text(300) })).max(100) }),
  faq: z.array(z.object({ id: z.number().int(), question: text(500), answer: text(5000) })).max(100),
  settings: z.object({ name: text(200), title: text(300), description: text(1000), keywords: text(1000), role: text(100), location: text(200), developer: z.object({ name: text(200), url: safeUrl }), email: z.union([z.literal(''), z.email()]), linkedin: safeUrl, behance: safeUrl, resume: safeUrl, gtm: z.string().regex(/^(|GTM-[A-Z0-9]+)$/), whatsapp: safeUrl, robots: z.enum(['index, follow', 'noindex, nofollow']).default('index, follow') }),
};
export type DocumentKey = keyof typeof documents;
export const leadStages = { new: 'Novo', contacted: 'Em contato', qualified: 'Qualificado', proposal: 'Proposta enviada', won: 'Ganho', lost: 'Perdido', spam: 'Spam', archived: 'Arquivado' } as const;
export const leadSchema = z.object({
  name: text(200).trim().min(2), email: z.email().max(254).transform(v => v.toLowerCase().trim()), phone: text(50).default(''), company: text(200).default(''), service: text(200).default(''), message: text(5000).trim().min(5),
  website: text(300).default(''), idempotencyKey: z.string().uuid(),
  source: text(100).default('lp'), page: text(2000).default(''), project: text(200).default(''),
  utm: z.record(z.string().max(100), text(500)).default({}), privacyVersion: text(50).default('1'), marketingConsent: z.boolean().default(false),
});
export const leadUpdateSchema = z.object({
  name: text(200).min(2), email: z.email().max(254).transform(v => v.toLowerCase()), phone: text(50), company: text(200), service: text(200),
  status: z.enum(Object.keys(leadStages) as [keyof typeof leadStages, ...(keyof typeof leadStages)[]]), priority: z.enum(['low', 'normal', 'high']),
  ownerId: z.string().nullable(), budget: z.number().min(0).max(9999999999).nullable(), deadline: z.string().nullable(), lostReason: text(2000), tags: z.array(text(100)).max(30), version: z.number().int(),
});
