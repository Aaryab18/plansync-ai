import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_PAGES = 50;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No PDF file was uploaded." },
        { status: 400 }
      );
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json(
        { success: false, error: "Only PDF files are supported." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "PDF is too large. Please upload a PDF smaller than 15 MB.",
        },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    // unpdf uses a serverless PDF.js build with the worker bundled/inlined,
    // so this route does not require a browser worker file.
    const pdf = await getDocumentProxy(data);

    if (pdf.numPages > MAX_PAGES) {
      return NextResponse.json(
        {
          success: false,
          error: `PDF has ${pdf.numPages} pages. Please upload a report with ${MAX_PAGES} pages or fewer.`,
        },
        { status: 400 }
      );
    }

    const { totalPages, text } = await extractText(pdf, {
      mergePages: true,
    });

    const extractedText = typeof text === "string" ? text.trim() : "";

    if (!extractedText) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No selectable text was found in this PDF. Scanned/image-only PDFs need OCR support.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      text: extractedText,
      pageCount: totalPages,
    });
  } catch (error) {
    console.error("PDF EXTRACTION ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract text from PDF.",
      },
      { status: 500 }
    );
  }
}
