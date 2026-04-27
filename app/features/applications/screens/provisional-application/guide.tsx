/**
 * Guide Page
 *
 * 한국 가출원 출원 가이드 페이지입니다.
 */
export default function Guide() {
  return (
    <div className="prose prose-sm dark:prose-invert">
      <h1>Filing Guide</h1>
      <h2>Step 1: Prepare Your Documents</h2>
      <p>
        Prepare a detailed description of your invention in English. Include any
        drawings or diagrams that help explain your invention. The description
        should cover:
      </p>
      <ul>
        <li>Technical field of the invention</li>
        <li>Background and problems solved</li>
        <li>Detailed description of how it works</li>
        <li>Potential applications and advantages</li>
      </ul>

      <h2>Step 2: Submit Your Application</h2>
      <p>
        Once your documents are ready, submit them through our platform. Our
        team will:
      </p>
      <ul>
        <li>Review your documents for completeness</li>
        <li>Translate them into Korean</li>
        <li>Format according to KIPO requirements</li>
        <li>File the application</li>
      </ul>

      <h2>Step 3: Receive Confirmation</h2>
      <p>After filing, you'll receive:</p>
      <ul>
        <li>Official filing receipt with application number</li>
        <li>Priority document for foreign filing</li>
        <li>Detailed instructions for next steps</li>
      </ul>
    </div>
  );
}
