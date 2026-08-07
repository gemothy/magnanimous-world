import type { SiteModule } from "@/lib/site-schema";

export function SectionRenderer({ modules }: { modules: SiteModule[] }) {
  return (
    <>
      {modules.map((module, index) => {
        if (module.type === "pillars") {
          return (
            <section className="moduleBand" key={`${module.type}-${index}`}>
              <div className="sectionHeader">
                <p>{module.eyebrow}</p>
                <h2>{module.title}</h2>
              </div>
              <div className="pillarGrid">
                {module.items.map((item) => (
                  <article className={`surface accent-${item.accent}`} key={item.title}>
                    <span className="indexMark">0{module.items.indexOf(item) + 1}</span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </section>
          );
        }

        if (module.type === "products") {
          return (
            <section className="moduleBand" key={`${module.type}-${index}`}>
              <div className="sectionHeader">
                <p>{module.eyebrow}</p>
                <h2>{module.title}</h2>
              </div>
              <div className="productShelf">
                {module.items.map((item) => (
                  <article className="productTile" key={item.name}>
                    <p className="productLabel">{item.label}</p>
                    <h3>{item.name}</h3>
                    <p>{item.body}</p>
                    <span>{item.note}</span>
                  </article>
                ))}
              </div>
            </section>
          );
        }

        if (module.type === "tiers") {
          return (
            <section className="moduleBand" key={`${module.type}-${index}`}>
              <div className="sectionHeader">
                <p>{module.eyebrow}</p>
                <h2>{module.title}</h2>
              </div>
              <div className="tierGrid">
                {module.items.map((item) => (
                  <article className={item.featured ? "tierTile featured" : "tierTile"} key={item.name}>
                    <h3>{item.name}</h3>
                    <p className="tierPrice">{item.price}</p>
                    <ul>
                      {item.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          );
        }

        return (
          <section className="creedBand" key={`${module.type}-${index}`}>
            <blockquote>{module.quote}</blockquote>
            <p>{module.attribution}</p>
          </section>
        );
      })}
    </>
  );
}
