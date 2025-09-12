import { useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:3000";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // envData will be a mapping of groupName -> object of key/value pairs
  const [envData, setEnvData] = useState<
    Record<string, Record<string, string>>
  >({});
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  // removed unused editKey/editValue state (editing handled per-group)
  const [groups, setGroups] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const login = async () => {
    const authHeader = btoa(`${username}:${password}`);
    try {
      const res = await fetch(`${API_BASE}/config`, {
        headers: { Authorization: `Basic ${authHeader}` },
      });
      if (res.ok) {
        setAuth(authHeader);
        setIsLoggedIn(true);
        await fetchConfig(authHeader); // pass header to avoid race
      } else {
        alert("로그인 실패: 아이디/패스워드를 확인하세요");
      }
    } catch (error) {
      console.error(error);
      alert("로그인 중 오류가 발생했습니다");
    }
  };

  const logout = () => {
    setAuth("");
    setIsLoggedIn(false);
    setEnvData({});
  };

  // fetchConfig now expects backend to return grouped envs OR we group client-side
  const fetchConfig = async (authHeader?: string) => {
    try {
      const res = await fetch(`${API_BASE}/config`, {
        headers: { Authorization: `Basic ${authHeader || auth}` },
      });
      if (!res.ok) {
        console.error("fetchConfig failed", res.status);
        return;
      }
      const data = await res.json();
      // if backend returns flat envs, wrap into a default group
      if (
        data &&
        typeof data === "object" &&
        !Object.values(data).some((v) => typeof v === "object")
      ) {
        setEnvData({
          default: Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          ),
        });
        setGroups(["default"]);
      } else {
        setEnvData(data);
        setGroups(Object.keys(data || {}));
      }
    } catch (e) {
      console.error("fetchConfig error", e);
    }
  };

  const loadEnv = async () => {
    const res = await fetch(`${API_BASE}/load-env`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ owner, repo, token }),
    });
    if (res.ok) {
      alert("Env loaded");
      fetchConfig();
    } else {
      alert("Failed to load env");
    }
  };

  const updateEnv = async (group: string, key: string, value: string) => {
    // backend currently supports PUT /env/:key (flat). We'll prefix group in key like group.key
    const composedKey = `${group}.${key}`;
    const res = await fetch(
      `${API_BASE}/env/${encodeURIComponent(composedKey)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({ value }),
      }
    );
    if (res.ok) {
      // update local state optimistically
      setEnvData((prev) => ({
        ...prev,
        [group]: { ...prev[group], [key]: value },
      }));
    }
  };

  const deleteEnv = async (group: string, key: string) => {
    const composedKey = `${group}.${key}`;
    const res = await fetch(
      `${API_BASE}/env/${encodeURIComponent(composedKey)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Basic ${auth}` },
      }
    );
    if (res.ok) {
      setEnvData((prev) => {
        const copy = { ...prev };
        if (copy[group]) delete copy[group][key];
        return copy;
      });
    }
  };

  const addGroup = () => {
    if (!newGroupName) return;
    if (groups.includes(newGroupName)) return;
    setGroups((g) => [...g, newGroupName]);
    setEnvData((prev) => ({ ...prev, [newGroupName]: {} }));
    setNewGroupName("");
  };

  const deleteGroup = (group: string) => {
    if (!window.confirm(`${group} 그룹을 정말 삭제하시겠습니까?`)) return;
    setEnvData((prev) => {
      const copy = { ...prev };
      delete copy[group];
      return copy;
    });
    setGroups((g) => g.filter((x) => x !== group));
  };

  if (!isLoggedIn) {
    return (
      <div className="login">
        <div className="login-card">
          <div className="brand">
            <h1>설정 서버</h1>
            <p className="subtitle">Git 기반 환경 관리</p>
          </div>
          <div className="login-form">
            <input
              type="text"
              placeholder="아이디"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="패스워드"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="primary" onClick={login}>
              로그인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="site-header">
        <div className="container header-inner">
          <div className="brand">
            <h1>설정 서버</h1>
            <span className="tagline">Git → Config</span>
          </div>
          <nav>
            <button className="ghost" onClick={() => window.location.reload()}>
              새로고침
            </button>
            <button className="primary" onClick={logout}>
              로그아웃
            </button>
          </nav>
        </div>
      </header>
      <main className="container">
        <section className="load-env card">
          <h2>Git에서 환경 불러오기</h2>
          <input
            type="text"
            placeholder="GitHub 소유자"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
          <input
            type="text"
            placeholder="레포지토리"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
          <input
            type="text"
            placeholder="토큰 (선택)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button onClick={loadEnv}>불러오기</button>
        </section>

        <section className="env-list">
          <h2>환경 변수 그룹</h2>
          <div className="toolbar">
            <input
              type="text"
              placeholder="검색(그룹 또는 키)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(
                  JSON.stringify(envData, null, 2)
                );
                alert("환경 데이터가 클립보드에 복사되었습니다.");
              }}
            >
              내보내기
            </button>
            <button onClick={() => setShowImport((s) => !s)}>가져오기</button>
            <button
              onClick={() => {
                // expand all
                const map: Record<string, boolean> = {};
                groups.forEach((g) => (map[g] = false));
                setCollapsed(map);
              }}
            >
              펼치기
            </button>
            <button
              onClick={() => {
                // collapse all
                const map: Record<string, boolean> = {};
                groups.forEach((g) => (map[g] = true));
                setCollapsed(map);
              }}
            >
              접기
            </button>
          </div>
          {showImport && (
            <div className="import-area">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={6}
                placeholder="여기에 JSON 붙여넣기"
              />
              <div>
                <button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(importText);
                      // merge parsed into envData
                      setEnvData((prev) => ({ ...prev, ...parsed }));
                      setGroups((prevGroups) =>
                        Array.from(
                          new Set([...prevGroups, ...Object.keys(parsed)])
                        )
                      );
                      setShowImport(false);
                      setImportText("");
                      alert("가져오기 완료 (클라이언트에만 적용됨)");
                    } catch (e) {
                      alert("JSON 파싱 오류");
                    }
                  }}
                >
                  가져오기 적용
                </button>
                <button
                  onClick={() => {
                    setShowImport(false);
                    setImportText("");
                  }}
                >
                  닫기
                </button>
              </div>
            </div>
          )}
          <div className="group-actions">
            <input
              type="text"
              placeholder="새 그룹 이름"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <button onClick={addGroup}>그룹 추가</button>
          </div>

          <div className="groups">
            {groups.map((group) => {
              const groupObj = envData[group] || {};
              const keys = Object.keys(groupObj);
              const totalSize = keys
                .map((k) => String(groupObj[k]).length)
                .reduce((a, b) => a + b, 0);
              const isEditing = editingGroup === group;
              return (
                <article className="group card" key={group}>
                  <header className="group-header">
                    <h3>{group}</h3>
                    <div className="meta">
                      항목: {keys.length} / 총크기: {totalSize} bytes
                    </div>
                    <div className="group-controls">
                      <button
                        onClick={() =>
                          setCollapsed((c) => ({ ...c, [group]: !c[group] }))
                        }
                      >
                        {collapsed[group] ? "펼치기" : "접기"}
                      </button>
                      {!isEditing ? (
                        <>
                          <button
                            onClick={() => {
                              setEditingGroup(group);
                              setEditingData({ ...groupObj });
                            }}
                          >
                            편집
                          </button>
                          <button onClick={() => deleteGroup(group)}>
                            그룹 삭제
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={async () => {
                              // save: iterate keys and call PUT for each
                              for (const k of Object.keys(editingData)) {
                                await updateEnv(group, k, editingData[k]);
                              }
                              setEditingGroup(null);
                            }}
                          >
                            저장
                          </button>
                          <button
                            onClick={() => {
                              setEditingGroup(null);
                              setEditingData({});
                            }}
                          >
                            취소
                          </button>
                        </>
                      )}
                    </div>
                  </header>

                  <section className="group-body">
                    {isEditing ? (
                      <div className="editor">
                        {Object.keys(editingData).map((k) => (
                          <div className="field" key={k}>
                            <label>{k}</label>
                            <input
                              type="text"
                              value={editingData[k]}
                              onChange={(e) =>
                                setEditingData((d) => ({
                                  ...d,
                                  [k]: e.target.value,
                                }))
                              }
                            />
                            <button
                              onClick={async () => {
                                await deleteEnv(group, k);
                                setEditingData((d) => {
                                  const copy = { ...d };
                                  delete copy[k];
                                  return copy;
                                });
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                        <div className="field add-field">
                          <input
                            type="text"
                            placeholder="키"
                            id={`new-key-${group}`}
                          />
                          <input
                            type="text"
                            placeholder="값"
                            id={`new-val-${group}`}
                          />
                          <button
                            onClick={() => {
                              const keyEl = document.getElementById(
                                `new-key-${group}`
                              ) as HTMLInputElement | null;
                              const valEl = document.getElementById(
                                `new-val-${group}`
                              ) as HTMLInputElement | null;
                              if (!keyEl || !valEl) return;
                              const k = keyEl.value.trim();
                              const v = valEl.value;
                              if (!k) return;
                              setEditingData((d) => ({ ...d, [k]: v }));
                              keyEl.value = "";
                              valEl.value = "";
                            }}
                          >
                            항목 추가
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="group-json">
                        {JSON.stringify(groupObj, null, 2)}
                      </pre>
                    )}
                  </section>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
