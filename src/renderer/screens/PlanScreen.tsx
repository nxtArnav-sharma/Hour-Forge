import React, { useState } from 'react';
import { CalendarClock, Clock, Info } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Block } from '../../core/types';

export const PlanScreen: React.FC = () => {
  const engineState = useStore(state => state.engineState);
  const games = useStore(state => state.games);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);

  const tracks = engineState?.tracks || [];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-purple-400" />
            Plan & Timeline View
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Active schedule timeline showing sequence of humanized Play and Rest intervals.
          </p>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="liquid-glass-card border-dashed p-12 text-center text-slate-400">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-400" />
          <p className="text-sm font-medium text-slate-300">No active run in progress.</p>
          <p className="text-xs text-slate-500 mt-1">
            Start a new run to view and inspect scheduled timeline blocks.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {tracks.map(track => {
            const game = games.find(g => g.appId === track.appId);
            const blocks = track.blocks || [];

            return (
              <div
                key={track.appId}
                className="liquid-glass-card p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center font-mono text-xs font-semibold text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
                      ID
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {game?.name || `App ${track.appId}`}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-mono">
                        App ID: {track.appId} · State: <strong className="text-purple-300">{track.state}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 font-mono">
                    Credited: <span className="text-white font-medium">{(track.creditedSeconds / 3600).toFixed(2)}h</span>
                  </div>
                </div>

                {/* Timeline Bar */}
                <div className="space-y-2">
                  <div className="h-11 w-full bg-[#080B11]/80 border border-white/[0.08] rounded-xl p-1.5 flex gap-1.5 overflow-x-auto">
                    {blocks.map(b => {
                      const isPlay = b.type === 'play';
                      const isSelected = selectedBlock?.id === b.id;
                      const durMin = (b.durationSec / 60).toFixed(0);

                      return (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBlock(b)}
                          style={{ flex: Math.max(1, b.durationSec) }}
                          className={`h-full min-w-[42px] rounded-lg px-2 flex items-center justify-between text-[11px] font-mono cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.5)]' : ''
                          } ${
                            isPlay
                              ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30'
                              : 'bg-amber-500/20 border border-amber-400/40 text-amber-300 hover:bg-amber-500/30'
                          }`}
                        >
                          <span className="truncate font-medium">{isPlay ? 'PLAY' : 'REST'}</span>
                          <span className="text-[10px] opacity-80">{durMin}m</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between text-[10px] text-slate-500 font-mono px-1">
                    <span>
                      {blocks[0] ? new Date(blocks[0].startUtc).toLocaleTimeString() : 'Start'}
                    </span>
                    <span>
                      {blocks.length > 0 ? new Date(blocks[blocks.length - 1]!.endUtc).toLocaleTimeString() : 'End'}
                    </span>
                  </div>
                </div>

                {/* Block Inspector Callout */}
                {selectedBlock && (
                  <div className="p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-purple-400" />
                        Selected Block: {selectedBlock.type.toUpperCase()} ({selectedBlock.id})
                      </span>
                      <button
                        onClick={() => setSelectedBlock(null)}
                        className="text-slate-400 hover:text-white text-[11px]"
                      >
                        Close
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-300 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Start Time</span>
                        <span>{new Date(selectedBlock.startUtc).toLocaleTimeString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">End Time</span>
                        <span>{new Date(selectedBlock.endUtc).toLocaleTimeString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Duration</span>
                        <span>{selectedBlock.durationSec}s ({(selectedBlock.durationSec / 60).toFixed(1)}m)</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Generator Reason</span>
                        <span className="truncate">{selectedBlock.reason || 'standard'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
