import { useEffect } from 'react';
import Nav from '../components/Nav.jsx';
import Hero from '../components/Hero.jsx';
import { Product, Scrub, Bento, Sectors, Cta, Footer } from '../components/Sections.jsx';
import { setupReveal } from '../lib/scroll.js';

/** The public page. The agent itself only opens after sign-up or login, on /app. */
export default function Landing() {
  useEffect(() => setupReveal(), []);
  return (
    <>
      <Nav />
      <Hero />
      <Product />
      <Scrub />
      <Bento />
      <Sectors />
      <Cta />
      <Footer />
    </>
  );
}
