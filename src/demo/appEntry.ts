import { mountApp } from './app';
import { PatchLog, highlightNodes } from './patchLog';

const container = document.getElementById('app');
const logRoot = document.getElementById('patch-log');
if (!container || !logRoot) throw new Error('#app, #patch-log 요소를 찾을 수 없습니다.');

const log = new PatchLog(logRoot);
let rendered = false;

mountApp(container, {
  onPatch: (patches, touched) => {
    // 첫 렌더는 전체가 CREATE 하나로 기록된다. 이후는 상태가 바뀔 때마다 바뀐 부분만 기록된다.
    log.record(rendered ? 'setState → update' : 'mount', patches);
    rendered = true;
    highlightNodes(touched);
  },
});
