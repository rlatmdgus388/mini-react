import { PatchLog, highlightNodes } from './patchLog';
import { mountPhase1 } from './phase1';

const logRoot = document.getElementById('patch-log');
if (!logRoot) throw new Error('#patch-log 요소를 찾을 수 없습니다.');
const log = new PatchLog(logRoot);

mountPhase1(document, {
  onPatch: (patches, touched, source) => {
    log.record(source, patches);
    highlightNodes(touched);
  },
});
