import { fetchFlightSuggestion } from "../lib/autofill/providers";

async function main() {
  const flightNumber = process.argv[2] ?? "UA120";
  const date = process.argv[3];

  try {
    const suggestion = await fetchFlightSuggestion(flightNumber, date);
    console.log(
      JSON.stringify(
        {
          input: { flightNumber, date },
          suggestion,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("[test-autofill] unable to fetch", {
      flightNumber,
      date,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

main();
