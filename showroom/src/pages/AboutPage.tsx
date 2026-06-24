import { Link } from 'react-router-dom'

export function AboutPage() {
  return (
    <div className="sm-simple-about">
      <section className="sm-simple-about-hero">
        <h1>Software for the work already happening.</h1>
        <p>
          SUPERMEGA.dev starts with a real file, folder, message, sheet, photo, or repeated task. The first delivery is one screen your team can judge.
        </p>
      </section>

      <section className="sm-simple-proof" aria-label="How SUPERMEGA works">
        <article>
          <span>1</span>
          <strong>Find the work people keep chasing.</strong>
        </article>
        <article>
          <span>2</span>
          <strong>Attach the source your team already trusts.</strong>
        </article>
        <article>
          <span>3</span>
          <strong>Ship one useful screen before expanding.</strong>
        </article>
      </section>

      <section className="sm-simple-proof" aria-label="Founder contact">
        <article>
          <span>01</span>
          <strong>Swan Htet, Founder</strong>
        </article>
        <article>
          <span>@</span>
          <strong>
            <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          </strong>
        </article>
        <article>
          <span>in</span>
          <strong>
            <a href="https://www.linkedin.com/in/theswanhtet" rel="noopener noreferrer" target="_blank">
              linkedin.com/in/theswanhtet
            </a>
          </strong>
        </article>
      </section>

      <section className="sm-simple-close">
        <h2>Show us one messy workflow.</h2>
        <Link className="sm-button-primary" to="/contact">
          Contact us
        </Link>
      </section>
    </div>
  )
}
