'use client';
export default function Error({ reset }: { reset: () => void }) { return <div className="panel empty"><strong>Não foi possível abrir esta tela.</strong><p>Confira a conexão com o banco e as permissões do seu usuário.</p><button className="button primary" onClick={reset}>Tentar novamente</button></div>; }
