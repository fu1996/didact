/**
 * 一次循环到底的任务进行拆分，使用fiber单元进行细化，
 * 借助浏览器的 requestIdleCallback 的api 实现，
 * 在 js 引擎中存在长时间耗时的任务下，对任务进行中断，
 * 使其不影响浏览器响应
 *
 * 存在的缺点是：任务调度节点和节点渲染是在同一阶段的，可能存在渲染不完全的情况。
 *
 * 详细说明如下：
 * 因为任务节点在配合调度中心的加持下是可以中断，恢复执行的。
 * 所以可能存在如下情况：
 * 假设有100个DOM节点，要渲染到用户界面上。
 * 而在浏览器的单次循环的剩余时间下（requestIdleCallback），
 * 调度中心只能够执行了 50个节点，
 * 当浏览器剩余的空余时间不满足调度中心下次执行了，执行权交还给浏览器。
 * 此时用户仅能看到 50个DOM节点的【不完全界面】。
 * 只有在调度中心再次获取到执行权的时候，才能继续剩下 50个节点的渲染。
 */

const SPECIAL_TYPE = {
  TEXT_ELEMENT: "TEXT_ELEMENT",
};

/**
 * 把当前VDom以及VDom的子节点转为VDom
 * @param {*} type
 * @param {*} props
 * @param  {...any} children
 * @returns
 */
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

/**
 * 文本节点要做特殊处理
 * @param {*} text
 * @returns
 */
function createTextElement(text) {
  return {
    type: SPECIAL_TYPE.TEXT_ELEMENT,
    props: {
      nodeValue: text,
      children: [],
    },
  };
}
// 只把当前虚拟DOM的prop筛选出来
const isProperty = (key) => key !== "children";

function createDom(fiber) {
  // 根据虚拟DOM类型创建真实DOM
  const dom =
    fiber.type == SPECIAL_TYPE.TEXT_ELEMENT
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  Object.keys(fiber.props)
    .filter(isProperty)
    .forEach((name) => {
      // 虚拟DOM的 props 绑定到真实 DOM上
      dom[name] = fiber.props[name];
    });

  return dom;
}

/**
 *
 * @param {*} element VDom
 * @param {*} container 真实挂载的DOM节点
 */
function render(element, container) {
  console.log("事件循环的起点", element, container);
  // 即将开始工作的 基础单元
  nextUnitOfWork = {
    dom: container,
    props: {
      children: Array.isArray(element) ? [...element] : [element],
    },
  };
}

// 下一个工作单元
let nextUnitOfWork = null;

function workLoop(deadline) {
  console.log("事件循环");
  // 是否可以继续工作
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    //
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // 剩余时间是否小于1
    const timeRemaining = deadline.timeRemaining();
    console.log("剩余时间", timeRemaining);
    // 如果此处的时间不足，可能导致多个节点时候的 performUnitOfWork 函数
    // 只进行了一半，就被浏览器打断了，导致界面上仅有部分节点。
    shouldYield = timeRemaining < 1;
  }
  // 循环的核心在此处
  requestIdleCallback(workLoop);
}
// 类似于setTimeout，但是触发的时机 是浏览器 空闲时候进行调用一次。
requestIdleCallback(workLoop);

/**
 * 在浏览器的一次循环中处理当前的vdom节点渲染到界面上，并返回下一个工作单元
 * @param {*} nextUnitOfWork
 */
function performUnitOfWork(fiber) {
  // 当前fiber节点 不存在真实DOM，生成一个真实的DOM
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  // 如果当前节点的父级存在，就将当前虚拟DOM节点挂载在父级上
  if (fiber.parent) {
    // 把内容渲染到界面上。
    console.log("渲染节点", fiber);
    fiber.parent.dom.appendChild(fiber.dom);
  }
  // 遍历子节点，继续执行 children 属性来自于 createElement 函数。
  const elements = fiber.props.children;
  let index = 0;
  // 定义其父级的兄弟节点
  let prevSibling = null;
  // 处理子节点
  while (index < elements.length) {
    const element = elements[index];
    // 创建 element 元素对应的 fiber 工作单元
    const newFiber = {
      type: element.type,
      props: element.props,
      parent: fiber, // 指向其父级 fiber 节点
      dom: null, // 代表还没创建和挂载 DOM 节点
    };
    // 当前是第一个节点，child 绑定到自身，查找规则是 当前工作节点下的第一个节点
    if (index === 0) {
      fiber.child = newFiber;
    } else {
      // 绑定其兄弟节点
      prevSibling.sibling = newFiber;
    }
    // 新的 fiber节点 成为了 上一个兄弟节点
    prevSibling = newFiber;
    // 继续下一个工作
    index++;
  }
  console.log("处理完子节点以后的结果为", fiber);
  // 存在子节点，返回子节点
  if (fiber.child) {
    return fiber.child;
  }
  // 1. 如果没有子节点，就查找兄弟节点
  let nextFiber = fiber;
  while (nextFiber) {
    // 3. 兄弟节点存在就返回
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    // 2. 一层一层向上查找兄弟节点
    nextFiber = nextFiber.parent;
  }
}

const Didact = {
  createElement,
  render,
};

/** @jsx Didact.createElement */
const element = new Array(10000).fill("hello").map((item, index) => (
  <div key={index}>
    <h1>Hello World {index}</h1>
  </div>
));
const container = document.getElementById("root");
Didact.render(element, container);
