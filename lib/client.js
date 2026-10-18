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
			".aoci-btn.primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-inverse,#fff);border-color:transparent}",
			".aoci-input,.aoci-select{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:6px;padding:3px 8px;font-size:12px;max-width:100%}",
			".aoci-inline-input{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:6px;padding:3px 8px;font-size:12px;min-width:0;flex:1 1 180px}",
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
			".aoci-banner.ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}",
			".aoci-code{font-family:ui-monospace,monospace;font-size:11px;white-space:pre-wrap;word-break:break-all}",
			".aoci-intro{color:var(--dsw-alias-label-secondary);font-size:12px;margin:0 0 10px;white-space:pre-wrap}",
			".aoci-checks{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}",
			".aoci-check{display:flex;align-items:baseline;gap:6px;font-size:12px}",
			".aoci-check>.aoci-dot{flex:0 0 auto;font-weight:600}",
			".aoci-check.ok>.aoci-dot{color:var(--dsw-alias-state-success-primary)}",
			".aoci-check.bad>.aoci-dot{color:var(--dsw-alias-state-error-primary)}",
			".aoci-check.warn>.aoci-dot{color:var(--dsw-alias-state-warn-primary)}",
			".aoci-check .aoci-v{word-break:break-all}",
			".aoci-opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px 14px;margin-bottom:10px}",
			".aoci-opt{display:flex;flex-direction:column;gap:3px;font-size:12px;min-width:0}",
			".aoci-opt>span{color:var(--dsw-alias-label-secondary);font-size:11px}",
			".aoci-opt-check{flex-direction:row;align-items:center;gap:6px;flex-wrap:wrap}",
			".aoci-pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:8px 10px;max-height:220px;overflow:auto;margin:4px 0 8px}",
			".aoci-step{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 10px;margin-bottom:6px}",
			".aoci-step .aoci-bad{color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap;word-break:break-word}",
			".aoci-guide-list{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:12px}",
			".aoci-guide-list li{margin:0}",
			".aoci-promptbox{display:flex;gap:6px;align-items:flex-start;margin-top:8px}",
			".aoci-promptbox .aoci-input{flex:1}",
			".aoci-sec{margin:10px 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);font-weight:600}",
			".aoci-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
			".aoci-subbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px}",
			".aoci-tabs{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}",
			".aoci-tab{border:none;background:transparent;color:inherit;padding:4px 12px;font-size:12px;cursor:pointer}",
			".aoci-tab.active{background:var(--dsw-alias-bg-layer-2);font-weight:600;box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}",
			".aoci-overview-list{display:flex;flex-direction:column;gap:8px}",
			".aoci-overview-row{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;cursor:pointer}",
			".aoci-overview-row:hover{background:var(--dsw-alias-bg-layer-2)}",
			".aoci-overview-row.sel{box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}",
			".aoci-bad{color:var(--dsw-alias-state-error-primary)}",
			".aoci-warn{color:var(--dsw-alias-state-warn-primary)}",
			".aoci-ok{color:var(--dsw-alias-state-success-primary)}",
			".aoci-timeline{display:flex;flex-direction:column;gap:2px;font-size:11px;font-family:ui-monospace,monospace}",
			".aoci-collapse-btn{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;padding:0 4px}",
			".aoci-mini{font-size:11px;color:var(--dsw-alias-label-secondary)}",
			".aoci-prompt-card{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 8px;margin-bottom:6px;display:flex;flex-direction:column;gap:4px}",
			".aoci-scroll{overflow:auto;max-height:320px}",
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

		function stampFull(ms) {
			if (!ms) return "-";
			try {
				return new Date(Number(ms)).toLocaleString("zh-CN", { hour12: false });
			} catch (error) {
				return "-";
			}
		}

		function isoShort(value) {
			const s = String(value || "");
			if (!s) return "-";
			return s.replace("T", " ").replace(/\.\d+Z?$/, "");
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

		/**
		 * 端点 POST：宿主半为旧版时路径不存在，webServer 会回退到 SPA 的
		 * index.html（HTML 不是 JSON），把这种情况翻译成可行动的提示。
		 * 宿主半与本浏览器半随包同版发布，改端点或请求形状必须两端同步并同步 README。
		 */
		function postApi(path, payload) {
			return fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json", accept: "application/json" },
				body: JSON.stringify(payload || {}),
			})
				.then((response) =>
					response.json().catch(() => ({
						error: "端点不可用：当前宿主半是旧版，请重启 DSH 加载新版 lib/index.js 后再试",
					})));
		}

		function fetchInstall(params) {
			const url = new URL("/aoci-panel/install", window.location.origin);
			const source = params || {};
			for (const key of Object.keys(source)) {
				const value = source[key];
				if (value === undefined || value === null || value === "") continue;
				url.searchParams.set(key, String(value));
			}
			return fetch(url.toString(), { headers: { accept: "application/json" } })
				.then((response) =>
					response.json().catch(() => ({
						error: "安装端点不可用：当前宿主半是旧版，请重启 DSH 加载新版 lib/index.js 后再试",
					})));
		}

		function postInstall(payload) {
			return postApi("/aoci-panel/install", payload);
		}

		/** 复制到剪贴板；不可用时降级为临时 textarea 选中复制。 */
		function copyText(text) {
			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text);
					return;
				}
			} catch (error) {
				/* 降级处理 */
			}
			try {
				const box = document.createElement("textarea");
				box.value = text;
				box.style.position = "fixed";
				box.style.opacity = "0";
				document.body.appendChild(box);
				box.select();
				document.execCommand("copy");
				box.remove();
			} catch (error) {
				/* 忽略复制失败 */
			}
		}

		/** 环境检查行：ok / warn / bad 三态。 */
		function checkRow(state, text) {
			const tone = state === true ? "ok" : state === "warn" ? "warn" : "bad";
			return react.createElement("div", { className: "aoci-check " + tone },
				react.createElement("span", { className: "aoci-dot" }, tone === "ok" ? "✓" : tone === "warn" ? "!" : "✗"),
				react.createElement("span", { className: "aoci-v" }, text));
		}

		/** 复选框行。 */
		function optCheck(label, checked, onChange) {
			return react.createElement("label", { className: "aoci-opt aoci-opt-check" },
				react.createElement("input", { type: "checkbox", checked: checked, onChange: (event) => onChange(event.target.checked) }),
				react.createElement("span", { style: { color: "inherit", textTransform: "none", letterSpacing: "0" } }, label));
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

		/** 可折叠区块。 */
		function Collapse(props) {
			const state = react.useState(props.defaultOpen !== false);
			const open = state[0];
			const setOpen = state[1];
			return react.createElement("div", null,
				react.createElement("div", { className: "aoci-row", style: { cursor: "pointer" }, onClick: () => setOpen(!open) },
					react.createElement("span", { className: "aoci-collapse-btn" }, open ? "▾" : "▸"),
					react.createElement("span", { className: "aoci-k" }, props.title),
					props.extra || null),
				open ? props.children : null);
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

		/** 工作区行的治理徽章。 */
		function statusChips(item) {
			const chips = [];
			if (!item.hasIndex) {
				chips.push(react.createElement(Chip, { key: "no", tone: "warn" }, "未初始化"));
				return chips;
			}
			const gov = item.governance;
			const check = item.check;
			const status = item.status;
			const aligned = check ? check.governanceAligned : gov ? gov.governance_aligned === true : status ? null : null;
			if (aligned === true) chips.push(react.createElement(Chip, { key: "al", tone: "ok" }, "已对齐"));
			else if (aligned === false) chips.push(react.createElement(Chip, { key: "al", tone: "bad" }, "未对齐"));
			else chips.push(react.createElement(Chip, { key: "al", tone: "warn" }, item.cliError ? "无治理事实" : "…"));
			if (gov) {
				if (gov.recovery_pending) chips.push(react.createElement(Chip, { key: "rec", tone: "bad" }, "Recovery 待处理"));
				if (Number(gov.pending_transactions) > 0) chips.push(react.createElement(Chip, { key: "tx", tone: "bad" }, "事务 " + fmt(gov.pending_transactions)));
				if (gov.budget) chips.push(react.createElement(Chip, { key: "bud", tone: gov.budget.status === "healthy" ? "ok" : "warn" }, "预算 " + gov.budget.status));
			}
			if (status && status.reports_pending > 0) chips.push(react.createElement(Chip, { key: "rep", tone: "warn" }, "报告 " + fmt(status.reports_pending)));
			return chips;
		}

		/** 工作区行的卷状态。 */
		function volumeText(item) {
			const states = item.volumeStates || {};
			const keys = Object.keys(states);
			if (keys.length === 0) return "-";
			return keys.map((key) => key + ":" + states[key]).join(" ");
		}

		/** 按 DSH home 取可选补丁目标（新旧 home 兼容）。 */
		function patchTargetsOf(dsh) {
			const targets = (dsh && dsh.targets) || [{ target: "home", label: "DSH home（全局生效）" }];
			return targets.map((item) => item.target);
		}

		function patchTargetLabels(dsh) {
			const targets = (dsh && dsh.targets) || [{ target: "home", label: "DSH home（全局生效）" }];
			return targets.map((item) => item.label || item.target);
		}

		/**
		 * 安装向导：仓库尚无 aoci.txt 时的引导式安装。
		 * 环境预检 → 选项 → 动作预览 → 执行（aoci init / scan / DSH 补丁行）→ 后续步骤。
		 */
		function InstallWizard(props) {
			const repo = String(props.repo || "");
			const bin = String(props.bin || "");
			const [plan, setPlan] = react.useState(null);
			const [planErr, setPlanErr] = react.useState("");
			const [planBusy, setPlanBusy] = react.useState(true);
			const [binDirInput, setBinDirInput] = react.useState("");
			const [dshHomeInput, setDshHomeInput] = react.useState("");
			const [dirty, setDirty] = react.useState(false);
			const [opts, setOpts] = react.useState(null);
			const [installing, setInstalling] = react.useState(false);
			const [result, setResult] = react.useState(null);

			function fetchPlan() {
				setPlanBusy(true);
				setPlanErr("");
				setResult(null);
				fetchInstall({
					repo: repo,
					bin: bin,
					binDir: dirty ? binDirInput : "",
					dshHome: dirty ? dshHomeInput : "",
				}).then((res) => {
					setPlanBusy(false);
					if (!res || res.error) {
						setPlanErr(String((res && res.error) || "预检失败"));
						setPlan(null);
						return;
					}
					setPlan(res);
					setBinDirInput(res.binDir || "");
					setDshHomeInput((res.dsh && res.dsh.home) || "");
					setDirty(false);
					if (props.onBinDir && res.binDir) props.onBinDir(res.binDir);
					setOpts({
						locale: res.defaults && res.defaults.locale ? res.defaults.locale : "zh-CN",
						scopeProfile: res.defaults && res.defaults.scopeProfile ? res.defaults.scopeProfile : "production",
						hooks: !!(res.defaults && res.defaults.hooks),
						agent: res.defaults && res.defaults.agent ? res.defaults.agent : "",
						integrateDsh: res.defaults ? res.defaults.integrateDsh !== false : true,
						runScan: !(res.defaults && res.defaults.runScan === false),
						patchTarget: (res.defaults && res.defaults.patchTarget) || ((res.dsh && res.dsh.target) || "home"),
					});
				}).catch((error) => {
					setPlanBusy(false);
					setPlanErr(String(error && error.message ? error.message : error));
				});
			}

			react.useEffect(() => {
				fetchPlan();
			}, [repo, bin]);

			function onInstall() {
				if (!plan || plan.hasIndex || installing) return;
				setInstalling(true);
				postInstall({
					repo: repo,
					bin: plan.bin || bin,
					locale: opts.locale,
					scopeProfile: opts.scopeProfile,
					hooks: opts.hooks,
					agent: opts.agent,
					integrateDsh: opts.integrateDsh,
					runScan: opts.runScan,
					patchTarget: opts.patchTarget,
					dshHome: dshHomeInput,
				}).then((res) => {
					setInstalling(false);
					setResult(res || { error: "空响应" });
				}).catch((error) => {
					setInstalling(false);
					setResult({ error: String(error && error.message ? error.message : error) });
				});
			}

			const kids = [];
			kids.push(react.createElement("p", { className: "aoci-intro", key: "intro" },
				"AOCI 是模型生成、模型读取的仓库级认知层（aoci.txt 索引 + .aoci/ 治理资产）。安装会在该仓库生成索引骨架、治理配置与 AGENTS.md 认知契约区块（不伪造任何项目条目），可选建立基线指纹，并接入 DSH 会话工具。"));
			if (plan && plan.aociCliVersion) {
				kids.push(react.createElement("div", { className: "aoci-mini", key: "cliver" }, "aoci CLI：" + plan.aociCliVersion));
			}

			if (planBusy) kids.push(react.createElement("div", { className: "aoci-empty", key: "busy" }, "正在检测安装环境…"));
			if (planErr) kids.push(react.createElement("div", { className: "aoci-banner bad", key: "perr" }, planErr));

			if (plan && !plan.hasIndex) {
				const checks = [];
				checks.push(checkRow(true, "目标仓库：" + plan.repo));
				checks.push(checkRow(!!plan.bin, plan.bin
					? "aoci CLI：" + plan.bin
					: "未探测到 aoci 可执行文件；可修改目录后重新检测（CLI 来自官方仓库 aoci-spec/aoci-code）"));
				const dsh = plan.dsh || {};
				if (!dsh.home) {
					checks.push(checkRow("warn", "未定位到 DSH home；可在下方填写"));
				} else if (dsh.integrated) {
					checks.push(checkRow(true, "DSH 已接入该仓库（补丁行 id=" + dsh.integratedRowId + "，serverName=" + (dsh.integratedServerName || "?") + "）"));
				} else {
					checks.push(checkRow(true, "DSH home：" + dsh.home + (dsh.patchExists ? "" : "（补丁文件将新建）")));
				}
				if (dsh.homes && dsh.homes.length > 1) {
					checks.push(checkRow("warn", "检测到多个 DSH home（新旧并存）：" + dsh.homes.join(" 、 ") + " —— 写入默认第一个，旧 home 只读兼容不改写"));
				}
				kids.push(react.createElement("div", { key: "checks" },
					react.createElement("div", { className: "aoci-sec" }, "环境检查"),
					react.createElement("div", { className: "aoci-checks" }, checks),
					react.createElement("div", { className: "aoci-row" },
						react.createElement("input", {
							className: "aoci-inline-input",
							placeholder: "aoci 可执行目录",
							value: binDirInput,
							onChange: (event) => { setBinDirInput(event.target.value); setDirty(true); },
						}),
						react.createElement("input", {
							className: "aoci-inline-input",
							placeholder: "DSH home（默认自动探测）",
							value: dshHomeInput,
							onChange: (event) => { setDshHomeInput(event.target.value); setDirty(true); },
						}),
						react.createElement("button", { className: "aoci-btn", disabled: planBusy || !dirty, onClick: fetchPlan }, "重新检测"))));

				if (opts) {
					const sel = (key, values, labels) => react.createElement("div", { className: "aoci-opt" },
						react.createElement("span", null, labels.title),
						react.createElement("select", {
							className: "aoci-select",
							value: opts[key],
							onChange: (event) => setOpts(Object.assign({}, opts, { [key]: event.target.value })),
						}, values.map((value, index) => react.createElement("option", { key: value, value: value }, labels.items[index]))));
					kids.push(react.createElement("div", { key: "opts" },
						react.createElement("div", { className: "aoci-sec" }, "安装选项"),
						react.createElement("div", { className: "aoci-opts" },
							sel("locale", ["zh-CN", "en-US"], { title: "项目 Locale", items: ["zh-CN 简体中文", "en-US English"] }),
							sel("scopeProfile", ["production", "full"], { title: "Managed Scope 配置", items: ["production（默认）", "full"] }),
							sel("agent", ["", "claude", "codex", "cursor", "opencode", "qoder", "all"], { title: "其他 Agent 接入（可选）", items: ["不接入", "claude（.mcp.json）", "codex（.codex/config.toml）", "cursor", "opencode", "qoder", "all"] }),
							sel("patchTarget", patchTargetsOf(dsh), { title: "DSH 补丁目标", items: patchTargetLabels(dsh) })),
						react.createElement("div", { className: "aoci-opts" },
							optCheck("接入 DSH：向补丁目标追加该仓库的 aoci MCP 服务器行（写前备份；重启 DSH 后生效）", opts.integrateDsh, (value) => setOpts(Object.assign({}, opts, { integrateDsh: value }))),
							optCheck("安装后执行 aoci scan 建立基线指纹（.aoci/baseline.json）", opts.runScan, (value) => setOpts(Object.assign({}, opts, { runScan: value }))),
							optCheck("同时安装宿主支持的生命周期 hook（Claude 写前 / Codex 压缩）", opts.hooks, (value) => setOpts(Object.assign({}, opts, { hooks: value }))))));

					const lines = [];
					lines.push("aoci init --repo <仓库> --locale " + opts.locale + " --scope-profile " + opts.scopeProfile + (opts.hooks ? " --hooks" : "") + (opts.agent ? " --agent " + opts.agent : ""));
					if (opts.runScan) lines.push("aoci scan --repo <仓库>");
					kids.push(react.createElement("div", { key: "preview" },
						react.createElement("div", { className: "aoci-sec" }, "将执行"),
						react.createElement("div", { className: "aoci-pre" }, lines.join("\n"))));
					if (opts.integrateDsh && dsh.block) {
						kids.push(react.createElement("div", { key: "previewYaml" },
							react.createElement("div", { className: "aoci-sec" }, "将追加到 " + (dsh.patchPath || "cordis.patch.yml")),
							react.createElement("div", { className: "aoci-pre" }, dsh.block)));
					}

					kids.push(react.createElement("div", { className: "aoci-row", key: "action" },
						react.createElement("button", { className: "aoci-btn primary", disabled: !plan.bin || installing, onClick: onInstall }, installing ? "安装中…" : "安装 AOCI"),
						react.createElement("span", { className: "aoci-k" }, "安装只写入该仓库的 AOCI 资产" + (opts.integrateDsh ? " 与 DSH 组合补丁行" : "") + "，不触碰业务代码。")));
				}
			}

			if (plan && plan.hasIndex) {
				kids.push(react.createElement("div", { className: "aoci-empty", key: "done" }, "该仓库已初始化 AOCI，无需安装；点击顶部「刷新」即可查看。"));
			}

			if (result) {
				const rkids = [];
				if (result.error) rkids.push(react.createElement("div", { className: "aoci-banner bad", key: "rerr" }, String(result.error)));
				for (const step of result.steps || []) {
					const ok = step.ran && step.exitCode === 0;
					rkids.push(react.createElement("div", { className: "aoci-step", key: step.key },
						react.createElement("div", { className: "aoci-row" },
							react.createElement(Chip, { tone: ok ? "ok" : "bad" }, ok ? "✓ 完成" : (step.ran ? "✗ exit=" + String(step.exitCode) : "✗ 未执行")),
							react.createElement("span", { className: "aoci-k" }, step.title)),
						step.command ? react.createElement("div", { className: "aoci-code" }, step.command) : null,
						step.output ? react.createElement("div", { className: "aoci-pre" }, step.output) : null,
						step.error ? react.createElement("div", { className: "aoci-bad" }, String(step.error)) : null,
						step.yaml ? react.createElement("div", null,
							react.createElement("div", { className: "aoci-k" }, "自动追加失败；可手动把下段追加到补丁目标："),
							react.createElement("div", { className: "aoci-pre" }, step.yaml)) : null));
				}
				if (result.ok) {
					const promptText = result.prompt || "";
					rkids.push(react.createElement("div", { key: "guide" },
						react.createElement("div", { className: "aoci-sec" }, "后续步骤"),
						react.createElement("ol", { className: "aoci-guide-list" }, (result.guide || []).map((item, index) => react.createElement("li", { key: index }, item))),
						react.createElement("div", { className: "aoci-promptbox" },
							react.createElement("input", { className: "aoci-input", readOnly: true, value: promptText }),
							react.createElement("button", { className: "aoci-btn", onClick: () => copyText(promptText) }, "复制提示词")),
						react.createElement("div", { className: "aoci-row", style: { marginTop: "8px" } },
							react.createElement("button", { className: "aoci-btn", onClick: props.onInstalled }, "刷新面板"))));
				}
				kids.push(react.createElement("div", { key: "result" },
					react.createElement("div", { className: "aoci-sec" }, result.ok ? "安装结果" : "安装失败"),
					rkids));
			}

			return react.createElement("div", { className: "aoci-card" },
				react.createElement("h4", null, "安装 AOCI"),
				kids);
		}

		/** 多仓库批量初始化（0.3.0）。 */
		function BatchWizard(props) {
			const [plan, setPlan] = react.useState(null);
			const [checked, setChecked] = react.useState({});
			const [busy, setBusy] = react.useState(true);
			const [err, setErr] = react.useState("");
			const [opts, setOpts] = react.useState({ locale: "zh-CN", scopeProfile: "production", agent: "", hooks: false, runScan: true, integrateDsh: true, patchTarget: "home" });
			const [running, setRunning] = react.useState(false);
			const [result, setResult] = react.useState(null);

			react.useEffect(() => {
				setBusy(true);
				fetchInstall({ repo: "", bin: props.bin || "" }).then((res) => {
					setBusy(false);
					if (res && res.error) setErr(String(res.error));
					else {
						setPlan(res);
						setOpts((prev) => Object.assign({}, prev, {
							patchTarget: (res.dsh && res.dsh.target) || "home",
						}));
					}
				}).catch((error) => {
					setBusy(false);
					setErr(String(error && error.message ? error.message : error));
				});
			}, []);

			const repos = (props.repos || []).filter((item) => !item.hasIndex);
			const selected = Object.keys(checked).filter((key) => checked[key]);

			function onRun() {
				if (selected.length === 0 || running) return;
				setRunning(true);
				setResult(null);
				postInstall({
					repos: selected,
					bin: (plan && plan.bin) || props.bin || "",
					locale: opts.locale,
					scopeProfile: opts.scopeProfile,
					agent: opts.agent,
					hooks: opts.hooks,
					runScan: opts.runScan,
					integrateDsh: opts.integrateDsh,
					patchTarget: opts.patchTarget,
				}).then((res) => {
					setRunning(false);
					setResult(res || { error: "空响应" });
				}).catch((error) => {
					setRunning(false);
					setResult({ error: String(error && error.message ? error.message : error) });
				});
			}

			const kids = [];
			kids.push(react.createElement("p", { className: "aoci-intro", key: "intro" },
				"批量初始化：对多个未构建 AOCI 的工作区依次执行 aoci init（+scan）并各自接入 DSH。每个仓库使用独立的行 id / serverName（防碰撞），按顺序执行。"));
			if (plan && plan.aociCliVersion) {
				kids.push(react.createElement("div", { className: "aoci-mini", key: "cliver" }, "aoci CLI：" + plan.aociCliVersion));
			}
			if (busy) kids.push(react.createElement("div", { className: "aoci-empty", key: "busy" }, "正在检测…"));
			if (err) kids.push(react.createElement("div", { className: "aoci-banner bad", key: "err" }, err));
			if (plan && plan.error) kids.push(react.createElement("div", { className: "aoci-banner bad", key: "planerr" }, String(plan.error)));
			if (repos.length === 0) {
				kids.push(react.createElement("div", { className: "aoci-empty", key: "none" }, "所有注册工作区都已初始化 AOCI。"));
			} else {
				kids.push(react.createElement("div", { key: "pick" },
					react.createElement("div", { className: "aoci-sec" }, "选择工作区（" + selected.length + "/" + repos.length + "）"),
					react.createElement("div", { className: "aoci-checks" },
						repos.map((item) => optCheck(
							(item.title || item.path) + " —— " + item.path,
							!!checked[item.path],
							(value) => setChecked(Object.assign({}, checked, { [item.path]: value })))))));
				kids.push(react.createElement("div", { key: "opts" },
					react.createElement("div", { className: "aoci-sec" }, "统一选项"),
					react.createElement("div", { className: "aoci-opts" },
						react.createElement("div", { className: "aoci-opt" },
							react.createElement("span", null, "项目 Locale"),
							react.createElement("select", { className: "aoci-select", value: opts.locale, onChange: (e) => setOpts(Object.assign({}, opts, { locale: e.target.value })) },
								react.createElement("option", { value: "zh-CN" }, "zh-CN 简体中文"),
								react.createElement("option", { value: "en-US" }, "en-US English"))),
						react.createElement("div", { className: "aoci-opt" },
							react.createElement("span", null, "Managed Scope"),
							react.createElement("select", { className: "aoci-select", value: opts.scopeProfile, onChange: (e) => setOpts(Object.assign({}, opts, { scopeProfile: e.target.value })) },
								react.createElement("option", { value: "production" }, "production（默认）"),
								react.createElement("option", { value: "full" }, "full"))),
						react.createElement("div", { className: "aoci-opt" },
							react.createElement("span", null, "DSH 补丁目标"),
							react.createElement("select", { className: "aoci-select", value: opts.patchTarget, onChange: (e) => setOpts(Object.assign({}, opts, { patchTarget: e.target.value })) },
								patchTargetsOf(plan && plan.dsh).map((value, index) =>
									react.createElement("option", { key: value, value: value }, patchTargetLabels(plan && plan.dsh)[index]))))),
					react.createElement("div", { className: "aoci-opts" },
						optCheck("接入 DSH（每个仓库独立 serverName）", opts.integrateDsh, (v) => setOpts(Object.assign({}, opts, { integrateDsh: v }))),
						optCheck("执行 aoci scan 建立基线", opts.runScan, (v) => setOpts(Object.assign({}, opts, { runScan: v }))))));
				kids.push(react.createElement("div", { className: "aoci-row", key: "run" },
					react.createElement("button", { className: "aoci-btn primary", disabled: selected.length === 0 || running, onClick: onRun }, running ? "初始化中…" : "批量初始化 " + selected.length + " 个工作区"),
					react.createElement("span", { className: "aoci-k" }, "按顺序执行；单个失败不影响后续仓库。")));
			}
			if (result) {
				const rows = (result.results || []).map((item) => react.createElement("div", { className: "aoci-step", key: item.repo },
					react.createElement("div", { className: "aoci-row" },
						react.createElement(Chip, { tone: item.ok ? "ok" : "bad" }, item.ok ? "✓" : "✗"),
						react.createElement("span", { className: "aoci-k" }, item.repo)),
					item.error ? react.createElement("div", { className: "aoci-bad" }, String(item.error)) : null,
					item.integration ? react.createElement("div", { className: "aoci-mini" }, "serverName=" + item.integration.serverName) : null));
				kids.push(react.createElement("div", { key: "result" },
					react.createElement("div", { className: "aoci-sec" }, "批量结果（" + (result.okCount || 0) + "/" + (result.total || 0) + " 成功）"),
					rows,
					react.createElement("div", { className: "aoci-row", style: { marginTop: "8px" } },
						react.createElement("button", { className: "aoci-btn", onClick: props.onInstalled }, "刷新面板"))));
			}
			return react.createElement("div", { className: "aoci-card" },
				react.createElement("h4", null, "批量初始化 AOCI"),
				kids);
		}

		/** 绑定诊断卡片（0.3.0）。 */
		function BindingCard(props) {
			const repo = String(props.repo || "");
			const bin = String(props.bin || "");
			const [data, setData] = react.useState(null);
			const [busy, setBusy] = react.useState(true);
			const [err, setErr] = react.useState("");
			const [fixing, setFixing] = react.useState(false);
			const [fixNote, setFixNote] = react.useState("");

			function load() {
				setBusy(true);
				setErr("");
				setFixNote("");
				api("/aoci-panel/binding", { repo, bin }).then((res) => {
					setBusy(false);
					if (!res || res.error) setErr(String((res && res.error) || "诊断失败"));
					else setData(res);
				}).catch((error) => {
					setBusy(false);
					setErr(String(error && error.message ? error.message : error));
				});
			}

			react.useEffect(() => {
				load();
			}, [repo, bin]);

			function onFix() {
				if (fixing) return;
				setFixing(true);
				setFixNote("");
				postApi("/aoci-panel/fix-binding", { repo, bin }).then((res) => {
					setFixing(false);
					if (!res || res.error) setFixNote(String((res && res.error) || "修复失败"));
					else {
						setFixNote(res.note || "已修复");
						load();
					}
				}).catch((error) => {
					setFixing(false);
					setFixNote(String(error && error.message ? error.message : error));
				});
			}

			const kids = [];
			if (busy) kids.push(react.createElement("div", { className: "aoci-empty", key: "busy" }, "正在诊断绑定…"));
			if (err) kids.push(react.createElement("div", { className: "aoci-banner bad", key: "err" }, err));
			if (fixNote) kids.push(react.createElement("div", { className: "aoci-banner ok", key: "fix" }, fixNote));
			if (data) {
				if ((data.rows || []).length === 0) {
					kids.push(react.createElement("div", { className: "aoci-mini", key: "norows" }, "未发现任何 dsh-mcp-client 补丁行。"));
				} else {
					kids.push(react.createElement("div", { key: "rows" },
						react.createElement("div", { className: "aoci-sec" }, "MCP 补丁行"),
						react.createElement("div", { className: "aoci-list aoci-scroll" },
							data.rows.map((row, index) => react.createElement("div", { className: "aoci-item", key: index, style: { cursor: "default" } },
								react.createElement(Chip, { tone: row.matches ? "ok" : "" }, row.target),
								react.createElement("span", { className: "aoci-name" }, row.id),
								react.createElement("span", { className: "aoci-tag" }, row.serverName ? "mcp__" + row.serverName + "__" : "(无 serverName)"),
								react.createElement("span", { className: "aoci-f" }, row.repo || row.command))))));
				}
				for (const finding of data.findings || []) {
					kids.push(react.createElement("div", { key: "f-" + finding.code, className: "aoci-banner " + (finding.tone === "bad" ? "bad" : "") },
						react.createElement("div", null, react.createElement("b", null, finding.code + "："), finding.message),
						finding.fix ? react.createElement("div", { className: "aoci-mini" }, "修复：" + finding.fix) : null));
				}
				kids.push(react.createElement("div", { key: "prompts" },
					react.createElement("div", { className: "aoci-sec" }, "给 Agent 的提示词"),
					(data.prompts || []).map((prompt) => react.createElement("div", { className: "aoci-prompt-card", key: prompt.key },
						react.createElement("div", { className: "aoci-k" }, prompt.title),
						react.createElement("div", { className: "aoci-pre", style: { margin: "0" } }, prompt.text),
						react.createElement("div", { className: "aoci-row" },
							react.createElement("button", { className: "aoci-btn", onClick: () => copyText(prompt.text) }, "复制"))))));
				kids.push(react.createElement("div", { className: "aoci-row", key: "actions" },
					react.createElement("button", { className: "aoci-btn", onClick: load }, "重新诊断"),
					react.createElement("button", { className: "aoci-btn", disabled: fixing, onClick: onFix }, fixing ? "修复中…" : "修复绑定（归一 command / --repo）")));
			}
			return react.createElement("div", { className: "aoci-card" },
				react.createElement("h4", null, "绑定诊断"),
				kids);
		}

		/** 多工作区总览（0.3.0）。 */
		function OverviewList(props) {
			const [data, setData] = react.useState(null);
			const [busy, setBusy] = react.useState(true);
			const [err, setErr] = react.useState("");
			const [q, setQ] = react.useState("");
			const [sortKey, setSortKey] = react.useState("title");
			const [sel, setSel] = react.useState("");
			const [detail, setDetail] = react.useState(null);
			const [detailBusy, setDetailBusy] = react.useState(false);
			const [actionOut, setActionOut] = react.useState(null);
			const [actionBusy, setActionBusy] = react.useState("");
			const [timeline, setTimeline] = react.useState([]);

			function note(text) {
				setTimeline((prev) => [{ ts: Date.now(), text: String(text) }].concat(prev).slice(0, 12));
			}

			function load(force) {
				setBusy(true);
				setErr("");
				api("/aoci-panel/workspaces", {
					sessionId: props.sessionId || "",
					binDir: props.binDir || "",
					bin: props.bin || "",
					force: force ? "1" : "",
				}).then((res) => {
					setBusy(false);
					if (!res || res.error) setErr(String((res && res.error) || "读取失败"));
					else {
						setData(res);
						note("工作区总览已刷新（" + (res.workspaces || []).length + " 个工作区）");
					}
				}).catch((error) => {
					setBusy(false);
					setErr(String(error && error.message ? error.message : error));
				});
			}

			react.useEffect(() => {
				load(false);
			}, [props.bin]);

			function openDetail(item) {
				setSel(item.path);
				setDetailBusy(true);
				setDetail(null);
				setActionOut(null);
				api("/aoci-panel/state", {
					sessionId: props.sessionId || "",
					binDir: props.binDir || "",
					bin: props.bin || "",
					repo: item.path,
				}).then((res) => {
					setDetailBusy(false);
					setDetail(res && res.snapshot ? res.snapshot : { error: (res && res.error) || "无快照" });
					if (props.onPickRepo) props.onPickRepo(item.path);
				}).catch((error) => {
					setDetailBusy(false);
					setDetail({ error: String(error && error.message ? error.message : error) });
				});
			}

			function runQuick(action, repo) {
				if (actionBusy) return;
				setActionBusy(action);
				setActionOut(null);
				postApi("/aoci-panel/action", { repo, bin: props.bin || "", action }).then((res) => {
					setActionBusy("");
					setActionOut(res || { error: "空响应" });
					note("快捷动作 " + action + "：" + (res && res.ok ? "完成" : String((res && res.error) || "失败")));
					if (action === "verify" || action === "check") load(false);
				}).catch((error) => {
					setActionBusy("");
					setActionOut({ error: String(error && error.message ? error.message : error) });
				});
			}

			const workspaces = (data && data.workspaces) || [];
			const needle = q.trim().toLowerCase();
			const filtered = needle
				? workspaces.filter((item) =>
					String(item.title || "").toLowerCase().indexOf(needle) >= 0 ||
					String(item.path || "").toLowerCase().indexOf(needle) >= 0 ||
					String(item.project || "").toLowerCase().indexOf(needle) >= 0)
				: workspaces.slice();
			filtered.sort((a, b) => {
				if (sortKey === "entries") return (b.entryCount || 0) - (a.entryCount || 0);
				if (sortKey === "status") {
					const rank = (item) => (!item.hasIndex ? 0 : item.check && item.check.governanceAligned ? 2 : 1);
					return rank(a) - rank(b) || String(a.title).localeCompare(String(b.title));
				}
				return String(a.title || a.path).localeCompare(String(b.title || b.path));
			});

			const kids = [];
			kids.push(react.createElement("div", { className: "aoci-subbar", key: "bar" },
				react.createElement("input", {
					className: "aoci-input",
					style: { flex: "1 1 180px" },
					placeholder: "搜索工作区（标题 / 路径 / 项目）…",
					value: q,
					onChange: (event) => setQ(event.target.value),
				}),
				react.createElement("select", { className: "aoci-select", value: sortKey, onChange: (event) => setSortKey(event.target.value) },
					react.createElement("option", { value: "title" }, "按名称排序"),
					react.createElement("option", { value: "entries" }, "按条目数排序"),
					react.createElement("option", { value: "status" }, "按治理状态排序")),
				react.createElement("button", { className: "aoci-btn", disabled: busy, onClick: () => load(true) }, busy ? "刷新中…" : "刷新")));
			if (err) kids.push(react.createElement("div", { className: "aoci-banner bad", key: "err" }, err));
			if (busy && !data) kids.push(react.createElement("div", { className: "aoci-empty", key: "busy" }, "正在聚合各工作区状态…"));
			kids.push(react.createElement("div", { className: "aoci-overview-list", key: "list" },
				filtered.map((item) => react.createElement("div", {
					key: item.path,
					className: "aoci-overview-row" + (sel === item.path ? " sel" : ""),
					onClick: () => openDetail(item),
				},
					react.createElement("div", { className: "aoci-row" },
						react.createElement("b", null, item.title || item.path),
						item.isSession ? react.createElement(Chip, { tone: "ok" }, "当前会话") : null,
						statusChips(item),
						react.createElement("span", { className: "aoci-spacer" }),
						react.createElement("span", { className: "aoci-mini" }, "条目 " + fmt(item.entryCount) + " · " + volumeText(item))),
					react.createElement("div", { className: "aoci-mini" }, item.path),
					react.createElement("div", { className: "aoci-row" },
						react.createElement("span", { className: "aoci-mini" }, item.binding && item.binding.length > 0
							? item.binding.map((b) => (b.namespace || "(未命名)") + (b.conflict ? "⚠冲突" : "")).join("、")
							: "未绑定 aoci MCP"),
						react.createElement("span", { className: "aoci-spacer" }),
						react.createElement("span", { className: "aoci-mini" },
							"最后 verify：" + isoShort(item.offline && item.offline.lastVerify) +
							(item.offline && item.offline.lastVerifyResult ? "（" + item.offline.lastVerifyResult + "）" : "") +
							" · 数据 " + stamp(item.cachedAt)))))));
			if (sel && detailBusy) kids.push(react.createElement("div", { className: "aoci-empty", key: "db" }, "正在深取该仓库快照…"));
			if (sel && detail) {
				const dkids = [];
				if (detail.error) dkids.push(react.createElement("div", { className: "aoci-banner bad", key: "derr" }, String(detail.error)));
				if (detail.hasIndex === false) {
					dkids.push(react.createElement("div", { className: "aoci-empty", key: "dno" }, "该仓库没有 aoci.txt —— 在「单仓库」标签用安装向导初始化。"));
				} else if (detail.hasIndex) {
					const gov = detail.governance;
					const check = detail.check;
					dkids.push(react.createElement("div", { className: "aoci-grid", key: "dgrid" },
						react.createElement(Field, { label: "项目", value: detail.project }),
						react.createElement(Field, { label: "条目", value: fmt((detail.entries || []).length) }),
						react.createElement(Field, { label: "对齐", value: check ? (check.governanceAligned ? "是" : "否") : "-" }),
						react.createElement(Field, { label: "下一步", value: check ? check.nextAction : "-" }),
						react.createElement(Field, { label: "预算", value: gov && gov.budget ? gov.budget.status + " " + fmt(gov.budget.whole_index_tokens) + "/" + fmt(gov.budget.target_tokens) : "-" }),
						react.createElement(Field, { label: "Recovery", value: gov ? (gov.recovery_pending ? "待处理" : "无") : "-" })));
					if (gov) {
						const drift = countDrift(gov.code_drift);
						if (drift.length > 0) {
							dkids.push(react.createElement("div", { key: "ddrift", style: { marginTop: "6px" } },
								react.createElement("div", { className: "aoci-k" }, "Code 漂移"),
								react.createElement("div", { className: "aoci-row" }, drift.map((item) => react.createElement(Chip, { key: item.label, tone: "bad" }, item.label + " " + fmt(item.count))))));
						}
					}
					dkids.push(react.createElement("div", { key: "dquick" },
						react.createElement("div", { className: "aoci-sec" }, "快捷动作"),
						react.createElement("div", { className: "aoci-row" },
							["verify", "check", "status", "doctor", "guide"].map((action) =>
								react.createElement("button", {
									key: action,
									className: "aoci-btn",
									disabled: !!actionBusy,
									onClick: (event) => { event.stopPropagation(); runQuick(action, sel); },
								}, actionBusy === action ? action + "…" : action)))));
					if (actionOut) {
						if (actionOut.error) {
							dkids.push(react.createElement("div", { className: "aoci-banner bad", key: "aerr" }, String(actionOut.error)));
						} else if (actionOut.summary) {
							const s = actionOut.summary;
							dkids.push(react.createElement("div", { key: "asum" },
								react.createElement("div", { className: "aoci-banner ok" }, actionOut.action + "：" + s.headline),
								(s.explain || []).map((item, index) => react.createElement("div", { key: index, className: "aoci-mini" }, "· " + item.text + (item.fix ? "（修复：" + item.fix + "）" : ""))),
								s.next ? react.createElement("div", { className: "aoci-mini", style: { marginTop: "4px" } }, "下一步：" + s.next) : null));
							dkids.push(react.createElement(Collapse, { key: "araw", title: "动作原始输出（JSON）", defaultOpen: false },
								react.createElement("div", { className: "aoci-pre" }, JSON.stringify(actionOut.json, null, 2))));
						}
					}
				}
				kids.push(react.createElement("div", { className: "aoci-card", key: "detail", style: { marginTop: "4px" } },
					react.createElement("h4", null, "仓库详情 · " + sel),
					dkids));
			}
			kids.push(react.createElement(Collapse, { key: "timeline", title: "最近操作时间线（本面板）", defaultOpen: false },
				react.createElement("div", { className: "aoci-timeline" },
					timeline.length === 0
						? react.createElement("div", { className: "aoci-mini" }, "暂无操作")
						: timeline.map((item, index) => react.createElement("div", { key: index }, stamp(item.ts) + "  " + item.text)))));
			return kids;
		}

		/** 常驻引导卡片：AOCI 概念、生命周期、面板说明与常用命令。 */
		function GuideCard() {
			return react.createElement("div", { className: "aoci-card" },
				react.createElement("h4", null, "AOCI 引导"),
				react.createElement("div", { className: "aoci-sec" }, "AOCI 是什么"),
				react.createElement("p", { className: "aoci-intro" },
					"AOCI 为仓库维护一个稳定、可版本化、可增量维护的认知层：根清单 aoci.txt 与各卷文件按「每个受管对象一条 Entry」描述职责、关系、对外契约与关键约束，由模型生成、模型读取，跨任务复用对系统的理解。"),
				react.createElement("div", { className: "aoci-sec" }, "生命周期"),
				react.createElement("ol", { className: "aoci-guide-list" },
					react.createElement("li", null, "安装：aoci init 生成索引骨架、.aoci/ 治理配置与 AGENTS.md 认知契约；aoci scan 建立基线指纹。未初始化的仓库在本面板会直接进入安装向导（支持批量）。"),
					react.createElement("li", null, "构建：在该仓库的会话中让 Agent 建立完整索引 —— Agent 会先调 aoci_rules 取得运行合同，再按实时 Guide 的阶段与安全停点创作 Header 与 Entries（机器不生成语义）。"),
					react.createElement("li", null, "使用：新会话开始时 Agent 通过 aoci_overview 建立认知；局部不确定时用 aoci_search / aoci_get_entries 定向检索。"),
					react.createElement("li", null, "维护：受管对象变化后，Agent 在收尾时调 aoci_maintain 领取批次并经 aoci_update_entry 提交语义更新；本面板「校验」随时可跑 aoci verify。")),
				react.createElement("div", { className: "aoci-sec" }, "面板区块"),
				react.createElement("ol", { className: "aoci-guide-list" },
					react.createElement("li", null, "多工作区：一屏聚合所有注册工作区的治理状态、卷、绑定与最后 verify；点行展开详情与快捷动作。"),
					react.createElement("li", null, "单仓库：索引概览、治理状态、条目浏览（F/R/A/S 全文 + 标签解义）。"),
					react.createElement("li", null, "绑定诊断：MCP serverName / 工具命名空间 / 仓库指向核对，附修复动作与可复制提示词。"),
					react.createElement("li", null, "初始化：单仓库安装向导与多工作区批量初始化。")),
				react.createElement("div", { className: "aoci-sec" }, "常用命令"),
				react.createElement("div", { className: "aoci-pre" },
					"aoci status --json      # 对齐状态速览\n" +
					"aoci check --json       # 提交前聚合检查\n" +
					"aoci verify             # 校验治理状态\n" +
					"aoci doctor             # 环境与 agent 接入诊断\n" +
					"aoci index agent guide  # 任务协议阶段与下一步\n" +
					"aoci ui                 # 本地只读状态页"),
				react.createElement("div", { className: "aoci-k", style: { marginTop: "6px" } },
					"DSH 接入：在当前 DSH home 的 cordis.patch.yml（或指定 profile 补丁）保持一条 dsh-mcp-client 行，工具以 mcp__<serverName>__aoci_* 形式出现在会话中；同机多个仓库绑定并存时认准各自 serverName 前缀，改补丁后需重启 DSH。"));
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
			const [guideOpen, setGuideOpen] = react.useState(false);
			const [tab, setTab] = react.useState("overview");

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
				react.createElement("div", { className: "aoci-tabs" },
					[["overview", "多工作区"], ["repo", "单仓库"], ["binding", "绑定诊断"], ["init", "初始化"]].map((pair) =>
						react.createElement("button", {
							key: pair[0],
							className: "aoci-tab" + (tab === pair[0] ? " active" : ""),
							onClick: () => setTab(pair[0]),
						}, pair[1]))),
				react.createElement("span", { className: "aoci-spacer" }),
				react.createElement("button", {
					className: "aoci-btn",
					onClick: () => setGuideOpen(!guideOpen),
				}, guideOpen ? "收起引导" : "引导"),
				bins.length > 1 ? react.createElement("select", {
					className: "aoci-select",
					title: "aoci 二进制（rc 版本降序，rc19+ 优先）",
					value: bin,
					onChange: (event) => {
						const next = event.target.value;
						setBin(next);
						if (repo) load(repo, next, true);
					},
				}, bins.map((item) => react.createElement("option", { key: item.path, value: item.path }, item.name))) : null,
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
			if (guideOpen) bodyChildren.push(react.createElement(GuideCard, { key: "guide" }));

			if (tab === "overview") {
				bodyChildren.push(react.createElement("div", { key: "ov" },
					react.createElement(OverviewList, {
						sessionId: sessionId,
						bin: bin,
						binDir: binDir,
						onPickRepo: (next) => {
							setRepo(next);
							load(next, bin, false);
							setTab("repo");
						},
					})));
			}

			if (tab === "binding") {
				bodyChildren.push(react.createElement(BindingCard, { key: "binding", repo: repo, bin: bin }));
			}

			if (tab === "init") {
				if (snap && snap.hasIndex === false) {
					bodyChildren.push(react.createElement(InstallWizard, {
						key: "wizard",
						repo: repo,
						bin: bin,
						onBinDir: (dir) => setBinDir(dir),
						onInstalled: () => load(repo, "", true),
					}));
				} else {
					bodyChildren.push(react.createElement("div", { className: "aoci-card", key: "initinfo" },
						react.createElement("h4", null, "初始化"),
						react.createElement("p", { className: "aoci-intro" },
							"当前仓库已初始化 AOCI。若要为其他未初始化的工作区构建 AOCI，请用下方批量向导。"),
						react.createElement("div", { className: "aoci-row" },
							react.createElement("button", { className: "aoci-btn", onClick: () => load("", "", true) }, "切换仓库后自动出现单仓库向导"))));
				}
				bodyChildren.push(react.createElement(BatchWizard, {
					key: "batch",
					repos: repos,
					bin: bin,
					onInstalled: () => load(repo, "", true),
				}));
			}

			if (tab === "repo") {
				bodyChildren.push(react.createElement("div", { className: "aoci-card", key: "repopick" },
					react.createElement("div", { className: "aoci-subbar", style: { marginBottom: "0" } },
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
						react.createElement("span", { className: "aoci-mini" }, "来自 DSH 注册工作区；默认自动定位到当前会话项目"))));
			}

			if (tab === "repo" && snap && snap.hasIndex === false) {
				bodyChildren.push(react.createElement(InstallWizard, {
					key: "wizard",
					repo: repo,
					bin: bin,
					onBinDir: (dir) => setBinDir(dir),
					onInstalled: () => load(repo, "", true),
				}));
			}

			if (tab === "repo" && snap && snap.hasIndex) {
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
