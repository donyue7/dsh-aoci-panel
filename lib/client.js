/**
 * dsh-aoci-panel —— 浏览器半（DSH 客户端模块 bundle）。
 *
 * 在会话视图标签中新增「AOCI」页（与「对话 / 轨迹 / 上下文」同级，order 30），
 * 渲染当前项目的 AOCI 认知：索引概览、治理状态、条目浏览。
 *
 * 数据全部来自本插件宿主半的本地只读端点 /aoci-panel/*（同源 fetch）。
 * 宿主对同一仓库的内存快照做持久缓存：切换标签/重挂载不会重新取数，
 * 只有面板上的「刷新」与「校验」才触发重新计算。
 */
window.__ModuleLoader__.load({
	id: "dsh-aoci-panel",
	factory: (require) => {
		var module = { exports: {} };
		let react = require("react");

		const CSS = [
			".aoci-panel{display:flex;flex-direction:column;min-height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}",
			".aoci-head{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap;position:sticky;top:0;background:var(--dsw-alias-bg-base);z-index:2}",
			".aoci-title{font-weight:600;font-size:13px}",
			".aoci-spacer{flex:1}",
			".aoci-body{padding:12px 14px 168px;display:flex;flex-direction:column;gap:10px}",
			".aoci-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:8px;padding:10px 12px}",
			".aoci-card>h4{margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);font-weight:600}",
			".aoci-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px 12px}",
			".aoci-kv{display:flex;flex-direction:column;gap:1px;min-width:0}",
			".aoci-k{color:var(--dsw-alias-label-secondary);font-size:11px}",
			".aoci-v{word-break:break-all;font-variant-numeric:tabular-nums;font-size:12px}",
			".aoci-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
			".aoci-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 8px;font-size:11px;background:var(--dsw-alias-bg-layer-2)}",
			".aoci-chip.ok{color:var(--dsw-alias-state-success-primary);border-color:currentColor}",
			".aoci-chip.bad{color:var(--dsw-alias-state-error-primary);border-color:currentColor}",
			".aoci-chip.warn{color:var(--dsw-alias-state-warn-primary);border-color:currentColor}",
			".aoci-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer}",
			".aoci-btn:hover{border-color:var(--dsw-alias-brand-primary)}",
			".aoci-btn:disabled{opacity:.5;cursor:default}",
			".aoci-input,.aoci-select{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:6px;padding:3px 8px;font-size:12px;max-width:100%}",
			".aoci-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;max-height:380px;overflow-y:auto}",
			".aoci-item{display:flex;gap:8px;padding:5px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;align-items:baseline}",
			".aoci-item:last-child{border-bottom:none}",
			".aoci-item:hover{background:var(--dsw-alias-bg-layer-2)}",
			".aoci-item.sel{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}",
			".aoci-name{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:nowrap}",
			".aoci-tag{font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-brand-primary)}",
			".aoci-f{color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}",
			".aoci-detail{display:flex;flex-direction:column;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".aoci-field{display:flex;gap:8px;align-items:baseline}",
			".aoci-field>b{flex:0 0 18px;color:var(--dsw-alias-brand-primary);font-family:ui-monospace,monospace;font-size:12px}",
			".aoci-field>span{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word}",
			".aoci-empty{color:var(--dsw-alias-label-secondary);padding:16px;text-align:center}",
			".aoci-banner{border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);border-radius:8px;padding:7px 10px;font-size:12px}",
			".aoci-banner.bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}",
			".aoci-code{font-family:ui-monospace,monospace;font-size:11px;white-space:pre-wrap;word-break:break-all}",
		].join("\n");

		function fmt(n) {
			const value = Number(n);
			if (!isFinite(value)) return "-";
			return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}

		function shortHash(value) {
			const s = String(value || "");
			return s.length > 16 ? s.slice(0, 16) + "…" : s;
		}

		function stamp(ms) {
			if (!ms) return "";
			try {
				return new Date(Number(ms)).toLocaleTimeString("zh-CN", { hour12: false });
			} catch (error) {
				return "";
			}
		}

		/** 同名同源只读端点调用；空参数不上送。 */
		function api(path, params) {
			const url = new URL(path, window.location.origin);
			const source = params || {};
			for (const key of Object.keys(source)) {
				const value = source[key];
				if (value === undefined || value === null || value === "") continue;
				url.searchParams.set(key, String(value));
			}
			return fetch(url.toString(), { headers: { accept: "application/json" } })
				.then((response) => response.json());
		}

		function Field(props) {
			return react.createElement("div", { className: "aoci-kv" },
				react.createElement("span", { className: "aoci-k" }, props.label),
				react.createElement("span", { className: "aoci-v" },
					props.value === "" || props.value === null || props.value === undefined ? "-" : String(props.value)));
		}

		function Chip(props) {
			return react.createElement("span", { className: "aoci-chip " + (props.tone || "") }, props.children);
		}

		function countDrift(drift) {
			if (!drift) return [];
			const keys = [["missing", "缺失"], ["orphan", "孤儿"], ["stale", "陈旧"], ["unbaselined", "未基线"], ["line_ending_only", "仅行尾"], ["observed_new", "新增观察"], ["observed_changed", "变更观察"], ["observed_removed", "移除观察"]];
			const out = [];
			for (const pair of keys) {
				const list = drift[pair[0]];
				if (list && list.length > 0) out.push({ label: pair[1], count: list.length, files: list });
			}
			return out;
		}

		/** 把紧凑标签 `A+B+C+[D]+E` 按元卷词典解成中文含义。 */
		function decodeTag(tag, dictionary, domain) {
			const s = String(tag || "");
			if (s.length < 4) return null;
			const dict = dictionary && dictionary[domain] ? dictionary[domain] : null;
			const a = s.charAt(0);
			const b = s.charAt(1);
			const c = s.charAt(2);
			const e = s.charAt(s.length - 1);
			const d = s.length > 4 ? s.slice(3, s.length - 1) : "";
			const pick = (group, key) => {
				if (!dict || !dict[group]) return "";
				return dict[group][key] || "";
			};
			return [
				pick("A", a) ? pick("A", a) : a,
				pick("B", b) ? pick("B", b) : b,
				pick("C", c) ? pick("C", c) : c,
				d ? "D:" + d : "",
				pick("E", e) ? pick("E", e) : e,
			].filter((item) => item !== "");
		}

		function AociPanel(props) {
			const sessionId = props && props.sessionId ? String(props.sessionId) : "";
			const [bins, setBins] = react.useState([]);
			const [bin, setBin] = react.useState("");
			const [binDir, setBinDir] = react.useState("");
			const [repos, setRepos] = react.useState([]);
			const [repo, setRepo] = react.useState("");
			const [snap, setSnap] = react.useState(null);
			const [busy, setBusy] = react.useState(true);
			const [err, setErr] = react.useState("");
			const [note, setNote] = react.useState("");
			const [q, setQ] = react.useState("");
			const [sel, setSel] = react.useState("");
			const [detail, setDetail] = react.useState(null);

			function applyState(res) {
				if (!res) {
					setErr("空响应");
					return;
				}
				if (res.error) {
					setErr(String(res.error));
					return;
				}
				setBins(res.bins || []);
				setBinDir(res.binDir || "");
				setRepos(res.repos || []);
				if (res.repo) setRepo(res.repo);
				setSnap(res.snapshot || null);
			}

			function load(nextRepo, nextBin, force) {
				if (force) {
					setBusy(true);
					setNote("");
				}
				setErr("");
				api("/aoci-panel/state", {
					sessionId,
					binDir,
					repo: nextRepo,
					bin: nextBin,
					force: force ? "1" : "",
				}).then((res) => {
					setBusy(false);
					applyState(res);
					if (force) {
						setSel("");
						setDetail(null);
					}
				}).catch((error) => {
					setBusy(false);
					setErr(String(error && error.message ? error.message : error));
				});
			}

			react.useEffect(() => {
				load("", "", false);
			}, []);

			function onVerify() {
				if (!repo) return;
				setBusy(true);
				setNote("");
				api("/aoci-panel/verify", { repo, bin }).then((res) => {
					setBusy(false);
					if (!res || res.error) {
						setErr(String((res && res.error) || "校验失败"));
						return;
					}
					setNote("verify " + String(res.result || "") + (res.governanceAligned ? "（已对齐）" : "（未对齐）"));
					load(repo, bin, true);
				}).catch((error) => {
					setBusy(false);
					setErr(String(error && error.message ? error.message : error));
				});
			}

			function onPick(id) {
				if (sel === id) {
					setSel("");
					setDetail(null);
					return;
				}
				setSel(id);
				setDetail(null);
				api("/aoci-panel/entry", { repo, id }).then((res) => {
					setDetail(res || null);
				}).catch((error) => {
					setDetail({ error: String(error && error.message ? error.message : error) });
				});
			}

			const entries = (snap && snap.entries) || [];
			const needle = q.trim().toLowerCase();
			const filtered = needle
				? entries.filter((item) => item.id.toLowerCase().indexOf(needle) >= 0 || item.tags.toLowerCase().indexOf(needle) >= 0 || item.f.toLowerCase().indexOf(needle) >= 0)
				: entries;
			const shown = filtered.slice(0, 300);
			const cli = (snap && snap.cli) || {};

			const head = react.createElement("div", { className: "aoci-head" },
				react.createElement("span", { className: "aoci-title" }, "AOCI 认知"),
				react.createElement("select", {
					className: "aoci-select",
					value: repo,
					disabled: busy,
					onChange: (event) => {
						const next = event.target.value;
						setRepo(next);
						load(next, bin, false);
					},
				}, repos.map((item) => react.createElement("option", { key: item.path, value: item.path },
					(item.title || item.path) + (item.hasIndex ? "" : "（无索引）")))),
				bins.length > 1 ? react.createElement("select", {
					className: "aoci-select",
					value: bin,
					onChange: (event) => {
						const next = event.target.value;
						setBin(next);
						if (repo) load(repo, next, true);
					},
				}, bins.map((item) => react.createElement("option", { key: item.path, value: item.path }, item.name))) : null,
				react.createElement("span", { className: "aoci-spacer" }),
				snap && snap.cachedAt ? react.createElement("span", { className: "aoci-k" }, "数据 " + stamp(snap.cachedAt)) : null,
				react.createElement("button", {
					className: "aoci-btn",
					disabled: busy || !repo,
					onClick: () => load(repo, bin, true),
				}, busy ? "载入中…" : "刷新"),
				react.createElement("button", {
					className: "aoci-btn",
					disabled: busy || !repo,
					onClick: onVerify,
				}, "校验"));

			const bodyChildren = [];
			if (err) bodyChildren.push(react.createElement("div", { className: "aoci-banner bad", key: "err" }, err));
			if (note) bodyChildren.push(react.createElement("div", { className: "aoci-banner", key: "note" }, note));
			if (snap && snap.hasIndex === false) {
				bodyChildren.push(react.createElement("div", { className: "aoci-empty", key: "noindex" }, "该仓库未初始化 AOCI（没有 aoci.txt）"));
			}

			if (snap && snap.hasIndex) {
				const status = snap.status || {};
				const governance = snap.governance;
				const check = snap.check;
				const aligned = check ? check.governanceAligned : (governance ? governance.governance_aligned === true : null);

				bodyChildren.push(react.createElement("div", { className: "aoci-card", key: "overview" },
					react.createElement("h4", null, "索引概览"),
					react.createElement("div", { className: "aoci-grid" },
						react.createElement(Field, { key: "project", label: "项目", value: snap.project }),
						react.createElement(Field, { key: "layout", label: "布局", value: status.layout_mode || snap.formatVersion }),
						react.createElement(Field, { key: "entries", label: "索引条目", value: fmt(status.index_entries !== undefined ? status.index_entries : entries.length) }),
						react.createElement(Field, { key: "volumes", label: "卷", value: (snap.volumes || []).map((item) => item.id + (item.present ? "✓" : "✗")).join(" ") }),
						react.createElement(Field, { key: "composite", label: "composite_identity", value: shortHash(status.composite_identity) }),
						react.createElement(Field, { key: "baseline", label: "基线文件", value: status.baseline_exists ? fmt(status.baseline_files) : (status.baseline_exists === false ? "无" : "-") }),
						react.createElement(Field, { key: "baselineAt", label: "基线更新时间", value: status.baseline_updated || "-" }),
						react.createElement(Field, { key: "lastVerify", label: "最近 verify", value: status.last_verify || "-" }),
						react.createElement(Field, { key: "reports", label: "待处理报告", value: status.reports_pending === undefined ? "-" : fmt(status.reports_pending) })),
					(status.recent_ops || []).length > 0 ? react.createElement("div", { style: { marginTop: "8px" } },
						react.createElement("div", { className: "aoci-k" }, "最近操作"),
						react.createElement("div", { className: "aoci-code" }, status.recent_ops.slice(-5).reverse().join("\n"))) : null));

				const govChildren = [];
				govChildren.push(react.createElement("div", { className: "aoci-row", key: "line1" },
					aligned === null
						? react.createElement(Chip, { tone: "warn" }, "未取得治理事实")
						: (aligned ? react.createElement(Chip, { tone: "ok" }, "已对齐") : react.createElement(Chip, { tone: "bad" }, "未对齐")),
					check ? react.createElement(Chip, { tone: check.ok ? "ok" : "bad" }, "check " + (check.ok ? "ok" : "failed")) : null,
					check && check.nextAction ? react.createElement(Chip, { tone: check.nextAction === "none" ? "ok" : "warn" }, "下一步：" + check.nextAction) : null,
					governance ? react.createElement(Chip, { tone: Number(governance.pending_transactions) === 0 ? "ok" : "bad" }, "待处理事务 " + fmt(governance.pending_transactions)) : null,
					governance ? react.createElement(Chip, { tone: governance.recovery_pending ? "bad" : "ok" }, "Recovery " + (governance.recovery_pending ? "待处理" : "无")) : null,
					governance && governance.budget ? react.createElement(Chip, { tone: governance.budget.status === "healthy" ? "ok" : "warn" }, "预算 " + governance.budget.status + " " + fmt(governance.budget.whole_index_tokens) + "/" + fmt(governance.budget.target_tokens)) : null));

				if (governance) {
					const scope = governance.managed_scope || {};
					govChildren.push(react.createElement("div", { className: "aoci-grid", key: "grid" },
						react.createElement(Field, { key: "scopeAligned", label: "Scope 对齐", value: scope.aligned ? "是" : "否" }),
						react.createElement(Field, { key: "scopeChange", label: "需变更 Scope", value: scope.scope_change_required ? "是" : "否" }),
						react.createElement(Field, { key: "idx", label: "index 规则", value: fmt(scope.index_count) }),
						react.createElement(Field, { key: "obs", label: "observe 规则", value: fmt(scope.observe_count) }),
						react.createElement(Field, { key: "exc", label: "exclude 规则", value: fmt(scope.exclude_count) }),
						react.createElement(Field, { key: "pending", label: "待裁决观察", value: fmt(scope.observed_pending_review) }),
						react.createElement(Field, { key: "srcCount", label: "业务源文件", value: fmt(governance.code_source_count) }),
						react.createElement(Field, { key: "entryCount", label: "Code 条目", value: fmt(governance.code_entry_count) })));
					const drift = countDrift(governance.code_drift);
					govChildren.push(react.createElement("div", { key: "drift", style: { marginTop: "8px" } },
						react.createElement("div", { className: "aoci-k" }, "Code 漂移"),
						drift.length === 0
							? react.createElement("div", { className: "aoci-row" }, react.createElement(Chip, { tone: "ok" }, "无漂移"))
							: react.createElement("div", { className: "aoci-row" }, drift.map((item) => react.createElement(Chip, { key: item.label, tone: item.label === "仅行尾" ? "warn" : "bad" }, item.label + " " + fmt(item.count)))),
						drift.length > 0 ? react.createElement("div", { className: "aoci-code", style: { marginTop: "6px", maxHeight: "110px", overflow: "auto" } },
							drift.reduce((acc, item) => acc.concat(item.files.map((file) => "[" + item.label + "] " + file)), []).join("\n")) : null));
				}

				const findings = (check && check.findings) || (governance && governance.findings) || [];
				if (findings.length > 0) {
					govChildren.push(react.createElement("div", { key: "findings", style: { marginTop: "8px" } },
						react.createElement("div", { className: "aoci-k" }, "Findings"),
						react.createElement("div", { className: "aoci-code" }, findings.map((item) => "- " + String(item.code || "") + (item.domain ? " [" + item.domain + "]" : "") + (item.cause ? " ← " + item.cause : "")).join("\n"))));
				}

				if (!governance && (snap.ledger || []).length > 0) {
					govChildren.push(react.createElement("div", { key: "ledger", style: { marginTop: "8px" } },
						react.createElement("div", { className: "aoci-k" }, "持久化审计（.aoci/ledger.jsonl，来自历次真实运行）"),
						react.createElement("div", { className: "aoci-code" }, snap.ledger.map((item) => item.ts + "  " + item.op + "  exit=" + String(item.exitCode) + (item.warnings === undefined ? "" : "  warn=" + String(item.warnings)) + "  [" + item.source + "]").join("\n"))));
				}

				govChildren.push(react.createElement("div", { key: "cli", className: "aoci-k", style: { marginTop: "8px" } },
					"CLI: " + (cli.bin || "（未探测到）")
					+ (cli.transport ? " · 通道=" + cli.transport : "")
					+ (cli.sandbox ? " · sandbox=" + cli.sandbox : "")
					+ ((cli.attempts || []).length ? " · 尝试=" + cli.attempts.join(",") : "")));
				if (cli.detail) {
					govChildren.push(react.createElement("div", { key: "cliDetail", className: "aoci-code", style: { marginTop: "4px", maxHeight: "90px", overflow: "auto" } }, String(cli.detail)));
				}

				bodyChildren.push(react.createElement("div", { className: "aoci-card", key: "gov" },
					react.createElement("h4", null, "治理状态"),
					govChildren));

				const listChildren = [];
				if (detail && !detail.error) {
					const decoded = decodeTag(detail.tags, snap.dictionary, detail.domain);
					listChildren.push(react.createElement("div", { className: "aoci-detail", key: "detail" },
						react.createElement("div", { className: "aoci-row" },
							react.createElement("span", { className: "aoci-name" }, detail.id),
							react.createElement("span", { className: "aoci-tag" }, "[" + detail.tags + "]"),
							react.createElement("span", { className: "aoci-spacer" }),
							react.createElement("button", { className: "aoci-btn", onClick: () => { setSel(""); setDetail(null); } }, "收起")),
						decoded ? react.createElement("div", { className: "aoci-row" }, decoded.map((item, index) => react.createElement(Chip, { key: index }, item))) : null,
						["f", "r", "a", "s"].map((key) => react.createElement("div", { className: "aoci-field", key },
							react.createElement("b", null, key.toUpperCase() + ":"),
							react.createElement("span", null, detail[key] && detail[key] !== "-" ? detail[key] : "—")))));
				} else if (detail && detail.error) {
					listChildren.push(react.createElement("div", { className: "aoci-banner bad", key: "detailErr" }, String(detail.error)));
				}

				listChildren.push(react.createElement("div", { className: "aoci-list", key: "list" },
					shown.length === 0
						? react.createElement("div", { className: "aoci-empty" }, "无匹配条目")
						: shown.map((item) => react.createElement("div", {
							key: item.id,
							className: "aoci-item" + (sel === item.id ? " sel" : ""),
							onClick: () => onPick(item.id),
						},
							react.createElement("span", { className: "aoci-f", style: { flex: "0 0 auto" } }, item.dir ? item.dir + "/" : ""),
							react.createElement("span", { className: "aoci-name" }, item.name),
							react.createElement("span", { className: "aoci-tag" }, "[" + item.tags + "]"),
							react.createElement("span", { className: "aoci-f" }, item.f)))));

				bodyChildren.push(react.createElement("div", { className: "aoci-card", key: "entries" },
					react.createElement("h4", null, "条目浏览 · " + fmt(filtered.length) + (filtered.length !== entries.length ? " / " + fmt(entries.length) : "")),
					react.createElement("div", { className: "aoci-row", style: { marginBottom: "8px" } },
						react.createElement("input", {
							className: "aoci-input",
							style: { flex: "1" },
							placeholder: "按路径 / 标签 / F 描述搜索…",
							value: q,
							onChange: (event) => setQ(event.target.value),
						})),
					listChildren));
			}

			return react.createElement("div", { className: "aoci-panel" },
				head,
				react.createElement("div", { className: "aoci-body" },
					busy && !snap ? react.createElement("div", { className: "aoci-empty" }, "正在读取 AOCI 状态…") : null,
					bodyChildren));
		}

		function apply(ctx) {
			ctx.effect(() => {
				const el = document.createElement("style");
				el.setAttribute("data-dsh-aoci-panel", "");
				el.textContent = CSS;
				document.head.appendChild(el);
				return () => {
					try {
						el.remove();
					} catch (error) {
						/* 样式已移除 */
					}
				};
			}, "dsh-aoci-panel: styles");
			ctx.slots.inject("conversation.view", () => {
				return ctx.slots.register({
					name: "conversation.view",
					id: "aoci",
					order: 30,
					label: "AOCI",
				}, (props) => react.createElement(AociPanel, props));
			});
		}

		module.exports = {
			name: "dsh-aoci-panel",
			inject: ["slots"],
			apply,
		};
		return module.exports;
	}
});
