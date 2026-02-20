import Editor from '@monaco-editor/react';
import { useFileStore } from '../../stores/fileStore.js';
import { cn } from '../../utils/cn.js';

interface MonacoEditorPanelProps {
  cardId: string;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    rb: 'ruby',
    yml: 'yaml',
    yaml: 'yaml',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    toml: 'toml',
    xml: 'xml',
    svg: 'xml',
    graphql: 'graphql',
    dockerfile: 'dockerfile',
  };
  return langMap[ext] || 'plaintext';
}

export default function MonacoEditorPanel({ cardId }: MonacoEditorPanelProps) {
  const openTabs = useFileStore((s) => s.openTabs);
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const setActiveFile = useFileStore((s) => s.setActiveFile);
  const closeTab = useFileStore((s) => s.closeTab);
  const updateFileContent = useFileStore((s) => s.updateFileContent);
  const saveFile = useFileStore((s) => s.saveFile);

  const activeTab = openTabs.find((t) => t.path === activeFilePath);

  const handleSave = () => {
    if (activeFilePath) {
      saveFile(cardId, activeFilePath);
    }
  };

  if (openTabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
        {openTabs.map((tab) => (
          <div
            key={tab.path}
            className={cn(
              'flex items-center gap-1 border-r border-gray-200 px-3 py-1.5 text-xs cursor-pointer',
              tab.path === activeFilePath
                ? 'bg-white text-gray-900 font-medium'
                : 'text-gray-500 hover:bg-gray-100',
            )}
            onClick={() => setActiveFile(tab.path)}
          >
            <span className="truncate max-w-[120px]">{tab.name}</span>
            {tab.modified && <span className="text-orange-400">*</span>}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.path);
              }}
              className="ml-1 rounded p-0.5 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Editor */}
      {activeTab && (
        <div className="flex-1">
          <Editor
            language={getLanguageFromPath(activeTab.path)}
            value={activeTab.content}
            onChange={(value) => {
              if (value !== undefined && activeFilePath) {
                updateFileContent(activeFilePath, value);
              }
            }}
            onMount={(editor) => {
              // Cmd/Ctrl+S to save
              editor.addCommand(
                // Monaco KeyMod.CtrlCmd | Monaco KeyCode.KeyS
                2048 | 49, // CtrlCmd + S
                handleSave
              );
            }}
            theme="vs-light"
            options={{
              fontSize: 13,
              lineHeight: 20,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 8 },
              automaticLayout: true,
            }}
          />
        </div>
      )}
    </div>
  );
}
