import { ArrowUpRight, MonitorPlay, MonitorSmartphone, TicketCheck, Wrench } from 'lucide-react';
import { Link } from 'react-router';

const destinations = [
  { to: '/painel', label: 'Painel da equipe', description: 'Gerencie a fila e acompanhe cada atendimento.', icon: Wrench, tone: 'blue' },
  { to: '/display', label: 'Tela de chamadas', description: 'Exiba senhas chamadas e vídeos para os clientes.', icon: MonitorPlay, tone: 'navy' },
] as const;

export function HomePage() {
  return (
    <div className="home-page">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Página inicial">
          <span className="brand-mark"><TicketCheck size={20} /></span>
          <span className="brand-copy"><strong>FILA DE ATENDIMENTO</strong><small>SISTEMA DE SENHAS</small></span>
        </Link>
        <span className="system-chip"><span /> Sistema de atendimento</span>
      </header>

      <main>
        <section className="welcome-hero">
          <div className="welcome-copy">
            <div className="eyebrow"><span /> ORGANIZAÇÃO QUE VOCÊ VÊ</div>
            <h1>Atendimento simples.<br /><em>Fila em movimento.</em></h1>
            <p>Senhas organizadas para a equipe e chamadas claras para cada cliente.</p>
            <Link className="primary-link" to="/painel">Acessar painel da equipe <ArrowUpRight size={17} /></Link>
          </div>
          <div className="hero-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="ticket-visual">
              <div className="ticket-visual-top"><span>ATENDIMENTO</span><TicketCheck size={20} /></div>
              <div className="ticket-visual-number">A<span>042</span></div>
              <div className="ticket-visual-bottom"><span>AGUARDE A CHAMADA</span><i /></div>
            </div>
            <span className="hero-floating floating-screen"><MonitorSmartphone size={19} /></span>
            <span className="hero-floating floating-spark">✳</span>
          </div>
        </section>

        <section className="entry-section" aria-labelledby="entry-title">
          <div className="section-heading">
            <div><span className="ui-eyebrow">ACESSOS DO SISTEMA</span><h2 id="entry-title">Por onde vamos começar?</h2></div>
            <p>Escolha uma área para continuar.</p>
          </div>
          <div className="entry-grid">
            {destinations.map(({ to, label, description, icon: Icon, tone }) => (
              <Link key={to} className="entry-card" to={to}>
                <span className={`entry-icon ${tone}`}><Icon size={21} /></span>
                <span className="entry-card-copy"><strong>{label}</strong><small>{description}</small></span>
                <ArrowUpRight className="entry-arrow" size={18} />
              </Link>
            ))}
          </div>
        </section>
      </main>
      <footer className="system-footer">
        <span className="system-footer-product">Produto</span>
        <img className="system-footer-logo" src="/assets/logo/Logo%20Union%20World%20em%203D.png" alt="Union World" />
      </footer>
    </div>
  );
}
