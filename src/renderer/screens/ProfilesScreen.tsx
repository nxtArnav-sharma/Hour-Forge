import React, { useState, useMemo } from 'react';
import { Sliders, BarChart3, Save } from 'lucide-react';
import { useStore } from '../store/useStore';
import { HumanProfile } from '../../core/types';
import { sampleSessionDurationSec } from '../../core/sampler';
import { Mulberry32 } from '../../core/rng';

export const ProfilesScreen: React.FC = () => {
  const profiles = useStore(state => state.profiles);
  const saveProfile = useStore(state => state.saveProfile);

  const [selectedProfileId, setSelectedProfileId] = useState<string>('regular');
  const activeProfile = profiles.find(p => p.id === selectedProfileId) || profiles[0]!;
  const [editedProfile, setEditedProfile] = useState<HumanProfile>(activeProfile);

  // Sync edited profile when switching selection
  React.useEffect(() => {
    setEditedProfile(activeProfile);
  }, [selectedProfileId]);

  // Generate 1,000-draw histogram distributions for preview
  const histogramData = useMemo(() => {
    const rng = new Mulberry32(42);
    const sessionBuckets: Record<string, number> = {};
    const binCount = 10;
    const minSec = editedProfile.session.minMin * 60;
    const maxSec = editedProfile.session.maxMin * 60;
    const step = (maxSec - minSec) / binCount;

    for (let i = 0; i < binCount; i++) {
      const startMin = Math.round((minSec + i * step) / 60);
      const endMin = Math.round((minSec + (i + 1) * step) / 60);
      sessionBuckets[`${startMin}-${endMin}m`] = 0;
    }

    const bucketKeys = Object.keys(sessionBuckets);
    for (let i = 0; i < 1000; i++) {
      const s = sampleSessionDurationSec(rng, editedProfile);
      const bucketIdx = Math.min(
        binCount - 1,
        Math.max(0, Math.floor((s - minSec) / step))
      );
      const key = bucketKeys[bucketIdx]!;
      sessionBuckets[key] = (sessionBuckets[key] || 0) + 1;
    }

    return Object.entries(sessionBuckets).map(([bin, count]) => ({
      bin,
      count
    }));
  }, [editedProfile]);

  const handleSave = async () => {
    await saveProfile(editedProfile);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-purple-400" />
            Human Profiles & Rhythm Parameters
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure humanized session lengths, rest scaling, active windows, and daily caps.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold liquid-glass-btn-primary"
        >
          <Save className="w-4 h-4" />
          Save Profile
        </button>
      </div>

      {/* Profile Selector Pills */}
      <div className="flex flex-wrap gap-2">
        {profiles.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedProfileId(p.id)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              selectedProfileId === p.id
                ? 'liquid-glass-card-glow text-white border-purple-400/50 shadow-[0_0_15px_rgba(139,92,246,0.3)]'
                : 'liquid-glass-card text-slate-400 hover:text-white'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Parameter Editor Form */}
        <div className="liquid-glass-card p-5 space-y-5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Edit Parameters: {editedProfile.name}
          </h3>

          <div className="space-y-4">
            {/* Session Bounds */}
            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-medium block">
                Session Length Bounds (Minutes)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-slate-500 block mb-1">Minimum (min)</span>
                  <input
                    type="number"
                    value={editedProfile.session.minMin}
                    onChange={e =>
                      setEditedProfile({
                        ...editedProfile,
                        session: { ...editedProfile.session, minMin: parseInt(e.target.value) || 1 }
                      })
                    }
                    className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block mb-1">Maximum (min)</span>
                  <input
                    type="number"
                    value={editedProfile.session.maxMin}
                    onChange={e =>
                      setEditedProfile({
                        ...editedProfile,
                        session: { ...editedProfile.session, maxMin: parseInt(e.target.value) || 1 }
                      })
                    }
                    className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Rest Bounds */}
            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-medium block">
                Between-Session Rest Bounds (Minutes)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-slate-500 block mb-1">Min Rest (min)</span>
                  <input
                    type="number"
                    value={editedProfile.rest.minMin}
                    onChange={e =>
                      setEditedProfile({
                        ...editedProfile,
                        rest: { ...editedProfile.rest, minMin: parseInt(e.target.value) || 1 }
                      })
                    }
                    className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block mb-1">Max Rest (min)</span>
                  <input
                    type="number"
                    value={editedProfile.rest.maxMin}
                    onChange={e =>
                      setEditedProfile({
                        ...editedProfile,
                        rest: { ...editedProfile.rest, maxMin: parseInt(e.target.value) || 1 }
                      })
                    }
                    className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Active Window */}
            {editedProfile.activeWindow && (
              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-medium block">
                  Active Window & Sleep Protection
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Start (HH:mm)</span>
                    <input
                      type="text"
                      value={editedProfile.activeWindow.start}
                      onChange={e =>
                        setEditedProfile({
                          ...editedProfile,
                          activeWindow: { ...editedProfile.activeWindow!, start: e.target.value }
                        })
                      }
                      className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">End (HH:mm)</span>
                    <input
                      type="text"
                      value={editedProfile.activeWindow.end}
                      onChange={e =>
                        setEditedProfile({
                          ...editedProfile,
                          activeWindow: { ...editedProfile.activeWindow!, end: e.target.value }
                        })
                      }
                      className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Edge Jitter (min)</span>
                    <input
                      type="number"
                      value={editedProfile.activeWindow.edgeJitterMin}
                      onChange={e =>
                        setEditedProfile({
                          ...editedProfile,
                          activeWindow: {
                            ...editedProfile.activeWindow!,
                            edgeJitterMin: parseInt(e.target.value) || 0
                          }
                        })
                      }
                      className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Daily Cap & Weekend Boost */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-slate-300 font-medium block mb-1">Daily Cap (Hours)</span>
                <input
                  type="number"
                  value={editedProfile.dailyCapHours || 12}
                  onChange={e =>
                    setEditedProfile({
                      ...editedProfile,
                      dailyCapHours: parseInt(e.target.value) || 12
                    })
                  }
                  className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <span className="text-xs text-slate-300 font-medium block mb-1">Weekend Boost (Multiplier)</span>
                <input
                  type="number"
                  step="0.1"
                  value={editedProfile.weekendSessionBoost || 1.0}
                  onChange={e =>
                    setEditedProfile({
                      ...editedProfile,
                      weekendSessionBoost: parseFloat(e.target.value) || 1.0
                    })
                  }
                  className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live 1,000-Draw Histogram Preview */}
        <div className="liquid-glass-card p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-purple-400 shrink-0" />
                Live 1,000-Draw Distribution Preview
              </h3>
              <span className="text-[10px] text-purple-400 font-mono whitespace-nowrap ml-2">
                Truncated Log-Normal
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Histogram of 1,000 statistical draws sampled from the current session parameters.
            </p>
          </div>

          <div className="h-64 flex items-end gap-1.5 p-3 bg-[#0B0E14] border border-[#1A2234] rounded-xl overflow-hidden">
            {histogramData.map((b, idx) => {
              const maxCount = Math.max(...histogramData.map(d => d.count), 1);
              const heightPct = Math.round((b.count / maxCount) * 100);

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-[9px] text-slate-400 font-mono">{b.count}</span>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full bg-gradient-to-t from-purple-600 to-cyan-400 rounded-t-sm transition-all duration-200"
                    title={`${b.bin}: ${b.count} draws`}
                  />
                  <span className="text-[8px] text-slate-500 font-mono truncate w-full text-center">
                    {b.bin}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500 font-mono flex justify-between">
            <span>Min: {editedProfile.session.minMin}m</span>
            <span>Median Target: ~{Math.round((editedProfile.session.minMin + editedProfile.session.maxMin) / 2)}m</span>
            <span>Max: {editedProfile.session.maxMin}m</span>
          </div>
        </div>
      </div>
    </div>
  );
};
