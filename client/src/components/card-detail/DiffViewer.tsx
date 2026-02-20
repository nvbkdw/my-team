import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

interface DiffViewerProps {
  oldValue: string;
  newValue: string;
  filename: string;
  splitView?: boolean;
}

export default function DiffViewer({
  oldValue,
  newValue,
  filename,
  splitView = true,
}: DiffViewerProps) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-3 py-1.5 text-xs font-mono text-gray-600 border-b border-gray-200">
        {filename}
      </div>
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={splitView}
        compareMethod={DiffMethod.WORDS}
        styles={{
          contentText: { fontSize: '12px', lineHeight: '18px' },
        }}
      />
    </div>
  );
}
