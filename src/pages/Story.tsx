import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export default function Story() {
  return (
    <div className="pt-24 sm:pt-40 pb-32 min-h-screen">
      <div className="max-w-[1440px] mx-auto px-6">
        <header className="mb-32 text-center border-b-4 border-z-border pb-24">
            <span className="text-[14px] font-mono uppercase tracking-[0.5em] text-z-muted font-black mb-10 block underline decoration-4 underline-offset-8">THE_GENESIS_FILE</span>
            <h1 className="font-display font-black text-6xl md:text-9xl tracking-tighter uppercase leading-[0.8]  ">
              BORN FROM A<br/>
              NEED FOR STILLNESS.
            </h1>
        </header>

        <div className="max-w-4xl mx-auto space-y-24 text-z-ink leading-relaxed">
          <p className="font-display font-black text-4xl sm:text-5xl tracking-tighter uppercase   text-center  ">
            "In a world that never stops talking, your space should be the frequency where you sync."
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 font-mono text-base font-bold uppercase tracking-widest text-z-muted">
            <p className="border-l-4 border-z-border pl-8 py-4">
              POSTER THEORY began in a digital studio, 2024. Surrounded by the sensory overload of the network, we realized that our physical spaces were cluttered—not just with objects, but with algorithm noise.
            </p>
            <p className="border-l-4 border-z-border pl-8 py-4">
              We set out to archive objects that didn't just occupy space, but commanded it. Objects with weight, history, and intent. What started as a personal archive soon became a collective for others.
            </p>
          </div>

          <div className="polaroid aspect-[16/9] bg-z-paper overflow-hidden shadow-[24px_24px_0px_0px_var(--color-z-shadow)]">
             <img 
               src="https://picsum.photos/seed/story-workshop/1600/900" 
               alt="Workshop" 
               className="w-full h-full object-cover brightness-75 hover:brightness-100 transition-all duration-1000"
               referrerPolicy="no-referrer"
             />
             <div className="tape top-0 right-1/2 translate-x-1/2 w-40 opacity-30" />
          </div>

          <p className="font-display font-black text-2xl uppercase tracking-tighter text-center leading-normal">
            Our aesthetic is <span className=" ">"CURATED_CHAOS"</span>—a protocol to describe life's beautiful, unpredictable nature balanced by the rigid precision of brutalist design. We don't believe in perfect homes; we believe in <span className="underline decoration-4">HONEST_ARCHIVES.</span>
          </p>

          <div className="pt-24 border-t-4 border-z-border flex flex-col items-center">
            <Link to="/collection" className="sticker-btn bg-z-ink text-white scale-125">EXPLORE_THE_CURATIONS_</Link>
            <p className="mt-16 font-mono text-[13px] uppercase font-black text-z-muted tracking-[0.5em]">END_OF_TRANSMISSION</p>
          </div>
        </div>
      </div>
    </div>
  );
}
