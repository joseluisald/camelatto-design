import type { Metadata } from 'next';
import { adminUrl } from '@/lib/paths';
import './globals.css';
export const metadata: Metadata = { title: { default: 'Camelatto Studio', template: '%s · Camelatto' }, description: 'Gestão do portfólio e relacionamento com clientes.', icons: { icon: { url: adminUrl('favicon.png'), type: 'image/png' }, apple: adminUrl('images/favicon.png') }, robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><head><style>{`@font-face{font-family:Instrument Sans;src:url('${adminUrl('fonts/portfolio-5.ttf')}') format('truetype');font-display:swap}@font-face{font-family:Bricolage Grotesque;src:url('${adminUrl('fonts/portfolio-3.ttf')}') format('truetype');font-weight:600;font-display:swap}@font-face{font-family:JetBrains Mono;src:url('${adminUrl('fonts/portfolio-8.ttf')}') format('truetype');font-display:swap}`}</style></head><body>{children}</body></html>;
}
