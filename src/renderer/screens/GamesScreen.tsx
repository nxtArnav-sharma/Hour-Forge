import React, { useState } from 'react';
import {
  Gamepad2,
  Plus,
  Trash2,
  ExternalLink,
  Sparkles,
  Search,
  CheckCircle,
  AlertCircle,
  GripVertical
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { GameEntry } from '../../shared/models';

export const GamesScreen: React.FC = () => {
  const games = useStore(state => state.games);
  const addGame = useStore(state => state.addGame);
  const removeGame = useStore(state => state.removeGame);
  const reorderGames = useStore(state => state.reorderGames);
  const addFreeLicense = useStore(state => state.addFreeLicense);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [appIdInput, setAppIdInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedGame, setResolvedGame] = useState<GameEntry | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<Record<number, string>>({});

  const handleResolve = async () => {
    if (!appIdInput.trim()) return;
    setIsResolving(true);
    setResolveError(null);
    setResolvedGame(null);
    try {
      const data = await window.hourforge.steam.resolveApp(appIdInput.trim());
      if (data) {
        setResolvedGame(data);
      } else {
        setResolveError('Could not resolve App ID from Steam Store API.');
      }
    } catch (err: any) {
      setResolveError(err?.message || 'Failed to query Steam Store API.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleConfirmAdd = async () => {
    if (!resolvedGame) return;
    await addGame(resolvedGame);
    setShowAddModal(false);
    setResolvedGame(null);
    setAppIdInput('');
  };

  const handleClaimLicense = async (appId: number) => {
    setLicenseStatus({ ...licenseStatus, [appId]: 'Claiming...' });
    try {
      await addFreeLicense(appId);
      setLicenseStatus({ ...licenseStatus, [appId]: 'License Added!' });
    } catch {
      setLicenseStatus({ ...licenseStatus, [appId]: 'Error claiming' });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-purple-400" />
            Games Library
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage tracked Steam games, target process executables, and free licenses.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold liquid-glass-btn-primary"
        >
          <Plus className="w-4 h-4" />
          Add Game
        </button>
      </div>

      {/* Games Grid (with Drag-and-Drop Reordering) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map((game, idx) => {
          const isDragging = dragIndex === idx;
          const isDragOver = dragOverIndex === idx && dragIndex !== idx;

          return (
            <div
              key={game.appId}
              draggable
              onDragStart={e => {
                setDragIndex(idx);
                e.dataTransfer.setData('text/plain', String(idx));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={e => {
                e.preventDefault();
                setDragOverIndex(idx);
              }}
              onDragLeave={() => {
                if (dragOverIndex === idx) setDragOverIndex(null);
              }}
              onDrop={e => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== idx) {
                  reorderGames(dragIndex, idx);
                }
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              className={`liquid-glass-card overflow-hidden flex flex-col group transition-all duration-200 ${
                isDragging ? 'opacity-40 scale-95 border-purple-500/50' : ''
              } ${isDragOver ? 'border-cyan-400/80 shadow-[0_0_20px_rgba(6,182,212,0.4)] scale-[1.02]' : ''}`}
            >
              <div className="h-32 bg-slate-900/60 relative overflow-hidden">
                {/* Drag Handle */}
                <div
                  className="absolute top-2 left-2 z-10 p-1.5 bg-black/60 rounded-lg text-slate-400 group-hover:text-white cursor-grab active:cursor-grabbing backdrop-blur-sm transition-opacity"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              {game.headerImage ? (
                <img
                  src={game.headerImage}
                  alt={game.name}
                  onError={e => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-mono">
                  No Image Available
                </div>
              )}
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <button
                  onClick={() => removeGame(game.appId)}
                  className="p-1.5 bg-black/60 hover:bg-rose-600/90 text-slate-300 hover:text-white rounded-lg transition-colors backdrop-blur-sm"
                  title="Remove from Library"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white truncate">{game.name}</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  App ID: {game.appId}
                </p>
                {game.developer && (
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {game.developer}
                  </p>
                )}
              </div>

              {/* Mirroring process names */}
              {game.processNames && game.processNames.length > 0 && (
                <div className="pt-2 border-t border-[#1A2234]">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono mb-1">
                    Process Mirroring
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {game.processNames.map((p, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 bg-[#0B0E14] text-[10px] font-mono text-slate-400 rounded border border-[#1A2234]"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Free License helper */}
              <div className="pt-2 border-t border-[#1A2234] flex items-center justify-between">
                <button
                  onClick={() => handleClaimLicense(game.appId)}
                  className="text-[11px] font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {licenseStatus[game.appId] || 'Claim Free License'}
                </button>

                <a
                  href={`https://store.steampowered.com/app/${game.appId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-500 hover:text-slate-300"
                  title="View in Steam Store"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>

      {/* Add Game Modal with Live Resolver */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="liquid-glass-card-glow w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Add Steam Game</h3>
            <p className="text-xs text-slate-400">
              Enter a Steam App ID or store page URL to query the official Steam Store API.
            </p>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 730 or store.steampowered.com/app/..."
                  value={appIdInput}
                  onChange={e => setAppIdInput(e.target.value)}
                  className="flex-1 bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none font-mono"
                />
                <button
                  onClick={handleResolve}
                  disabled={isResolving || !appIdInput.trim()}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  {isResolving ? 'Resolving...' : 'Lookup'}
                </button>
              </div>

              {resolveError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resolveError}</span>
                </div>
              )}

              {/* Resolved Preview Card */}
              {resolvedGame && (
                <div className="bg-[#0B0E14] border border-[#232B3D] rounded-xl p-3 flex items-center gap-3">
                  {resolvedGame.headerImage && (
                    <img
                      src={resolvedGame.headerImage}
                      alt={resolvedGame.name}
                      className="w-20 h-10 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 overflow-hidden">
                    <h4 className="text-xs font-semibold text-white truncate">
                      {resolvedGame.name}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono">
                      App ID: {resolvedGame.appId} · {resolvedGame.developer || 'Unknown Developer'}
                    </p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#1A2234]">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setResolvedGame(null);
                  setAppIdInput('');
                }}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-[#1A2234] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={!resolvedGame}
                className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg shadow-md transition-colors"
              >
                Add to Library
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

