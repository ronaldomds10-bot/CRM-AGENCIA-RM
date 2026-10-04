Assets for the flight emission PDF

- `rm-partiu.png` and `latam.png`: original logo images extracted locally from the user-provided reference PDF, without passenger or booking data.
- Icon paths in `src/lib/emission-pdf.ts` use Lucide (license in `LUCIDE-LICENSE.txt`).
- Inter 4.1 static fonts are in `../fonts/inter`, with their SIL Open Font License. Source: https://github.com/rsms/inter/releases/tag/v4.1.

The reference page measures 476.88 × 770.88 PDF points. The renderer keeps this format, embeds the fonts, and generates all passenger details and QR codes from the current emission.
