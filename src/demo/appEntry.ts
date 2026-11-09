import { mountApp } from './app';

const container = document.getElementById('app');
if (!container) throw new Error('#app 요소를 찾을 수 없습니다.');
mountApp(container);
