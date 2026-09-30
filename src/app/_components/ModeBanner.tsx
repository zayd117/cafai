import { getProviders } from "@/engine/providers";

/** Never let sample data pass as real (plan §9 closed world; build rule "never pretend mock functionality is real"). */
export function ModeBanner() {
  const fixture = process.env.CAFAI_CATALOG === "fixture";
  const mock = getProviders().mock;
  if (!fixture && !mock) return null;
  return (
    <div className="banner" role="note">
      <span className="tag">Sample mode</span>
      <span>
        {fixture && "The tool list is fictional test data. "}
        {mock && "No AI model is connected, so understanding and explanations come from simple rules or scripted test answers. "}
        Nothing here is a real recommendation.
      </span>
    </div>
  );
}
