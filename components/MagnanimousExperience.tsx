"use client";

import { FormEvent, useCallback, useState, useTransition } from "react";
import { verifyGate } from "@/app/actions";
import { hubModules } from "@/lib/site-schema";
import { AstralLock } from "@/components/AstralLock";
import { PortalDoors } from "@/components/PortalDoors";
import { SectionRenderer } from "@/components/SectionRenderer";

type View = "gate" | "lock" | "hub";

export function MagnanimousExperience() {
  const [view, setView] = useState<View>("gate");
  const [word, setWord] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [gateMessage, setGateMessage] = useState("");
  const [portalActive, setPortalActive] = useState(false);
  const [isPending, startTransition] = useTransition();

  const finishPortal = useCallback(() => {
    setPortalActive(false);
    setView("hub");
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }, []);

  function openPortal() {
    setGateMessage("");
    setAttempts(0);
    setPortalActive(true);
  }

  function submitGate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentAttempt = attempts;
    startTransition(async () => {
      const result = await verifyGate(word, currentAttempt);
      setGateMessage(result.message);

      if (result.ok) {
        openPortal();
        return;
      }

      setAttempts((value) => value + 1);
    });
  }

  function speakWord(finalWord: string) {
    setWord(finalWord);
    openPortal();
  }

  return (
    <main className="siteShell">
      <PortalDoors active={portalActive} onDone={finishPortal} />
      {view === "gate" ? <div className="gateImageBackdrop" aria-hidden="true" /> : null}

      {view === "gate" ? (
        <section className="gateView" aria-labelledby="gate-title">
          <div className="gateCard glass">
            <div className="gateOracleWindow" aria-hidden="true" />
            <h1 id="gate-title" className="brandTitle">
              MAGNANIMOUS
            </h1>
            <div className="rule" />
            <p className="latin">Magnus Animus - the great spirit.</p>
            <p className="creed">Membership is not bought. It is recognized. Speak the Word and the doors will know you.</p>
            <form onSubmit={submitGate}>
              <div className="wordRow">
                <input
                  id="word"
                  value={word}
                  onChange={(event) => setWord(event.target.value)}
                  placeholder="THE WORD"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={16}
                />
                <button className="btn" type="submit" disabled={isPending}>
                  {isPending ? "Listening" : "Enter"}
                </button>
              </div>
            </form>
            {gateMessage ? <p className={gateMessage.includes("yields") ? "successText" : "warningText"}>{gateMessage}</p> : null}
            <button className="earnLink" type="button" onClick={() => setView("lock")}>
              I do not have the Word - let me earn it
            </button>
          </div>
        </section>
      ) : null}

      {view === "lock" ? (
        <section className="lockView" aria-labelledby="lock-title">
          <div className="lockHead">
            <h1 id="lock-title">THE PHILOSOPHER&apos;S LOCK</h1>
            <p>
              Three wheels, marked I to XII. Reason out where each must stand, set them, then try the lock.
            </p>
          </div>
          <div className="puzzleCard glass">
            <div className="puzzleChambers">
              <section className="inscriptionPanel" aria-label="Inscription clues">
                <article className="stanza">
                  <span>Outer Wheel - Spirit</span>
                  <p>
                    Swiftest of the wanderers am I, courier of the gods. To mine own measure wed the metal
                    of love, and the red planet&apos;s iron; cast the whole upon the twelve, and set me to what remains.
                  </p>
                </article>
                <article className="stanza">
                  <span>Middle Wheel - Soul</span>
                  <p>
                    The night&apos;s pale mirror outshines the wandering king&apos;s dull metal. Take the lesser from
                    the greater; there the soul keeps its station.
                  </p>
                </article>
                <article className="stanza">
                  <span>Inner Wheel - Body</span>
                  <p>
                    The cold grey elder, heaviest of the seven, halves his leaden weight and weds the crown
                    of day, that the body may endure.
                  </p>
                </article>

                <div className="tabula">
                  <p>Tabula of the Seven</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Planet</th>
                        <th>Metal</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Sol</td>
                        <td>Gold</td>
                        <td>6</td>
                      </tr>
                      <tr>
                        <td>Luna</td>
                        <td>Silver</td>
                        <td>9</td>
                      </tr>
                      <tr>
                        <td>Mercury</td>
                        <td>Quicksilver</td>
                        <td>4</td>
                      </tr>
                      <tr>
                        <td>Venus</td>
                        <td>Copper</td>
                        <td>7</td>
                      </tr>
                      <tr>
                        <td>Mars</td>
                        <td>Iron</td>
                        <td>5</td>
                      </tr>
                      <tr>
                        <td>Jupiter</td>
                        <td>Tin</td>
                        <td>3</td>
                      </tr>
                      <tr>
                        <td>Saturn</td>
                        <td>Lead</td>
                        <td>8</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mechanismPanel" aria-label="Philosopher's lock">
                <AstralLock onSpeak={speakWord} />
              </section>
            </div>
            <button className="backLink" type="button" onClick={() => setView("gate")}>
              back to the doors
            </button>
          </div>
        </section>
      ) : null}

      {view === "hub" ? (
        <section className="hubView revealView" aria-labelledby="hub-title">
          <div className="hubHero">
            <p className="eyebrow">You are now within</p>
            <h1 id="hub-title">The long life is a discipline, not a wish.</h1>
            <p>
              For those who refuse the slow surrender of the body. The Magnanimous is an order devoted
              to longevity, vitality, vigor, and the natural art of keeping them.
            </p>
            <button type="button" onClick={() => setView("gate")}>
              Seal the doors
            </button>
          </div>
          <SectionRenderer modules={hubModules} />
          <p className="disclaimer">
            Concept prototype. These statements have not been evaluated by any regulatory body. Products
            are fictional and not intended to diagnose, treat, cure, or prevent disease.
          </p>
        </section>
      ) : null}
    </main>
  );
}
