export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 space-y-6">
      <h1 className="text-3xl font-bold">Privacy</h1>
      <div className="space-y-4 text-muted-foreground">
        <p>
          PDF Toolkit processes all files entirely in your browser using
          client-side JavaScript. No files, file contents, or file metadata are
          ever uploaded to any server.
        </p>
        <p>
          We do not use analytics, cookies, or tracking of any kind on your
          files. The app works fully offline once loaded.
        </p>
        <p>
          Your documents stay on your device from start to finish. We have no
          ability to access, read, or store any of the files you process.
        </p>
      </div>
    </div>
  );
}
