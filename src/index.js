/**
 * v4版本去解决v3版本中未实现的更新和删除操作
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
const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);

function createDom(fiber) {
  // 根据虚拟DOM类型创建真实DOM
  const dom =
    fiber.type == SPECIAL_TYPE.TEXT_ELEMENT
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

  return dom;
}

// 下一个工作单元
let nextUnitOfWork = null;
// 循环更新的节点 work in progress root
let wipRoot = null;
// 当前的工作节点
let currentRoot = null;
// 记录删除的数组
let deletions = null;

// 函数组件专用
// 记录当前工作的fiber节点 work in fiber
let wipFiber = null;
// 记录当前函数组件执行的 hook的索引 （这样一个函数组件可以支持多次 useState 调用）
let hookIndex = null;

/**
 * 一次性将当前fiber节点的变更，更新为 真实的 DOM
 */
function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  // 暂存当前 fiber节点到 currentRoot
  currentRoot = wipRoot;
  // 循环更新的节点 置为空
  wipRoot = null;
  console.log("渲染结束", wipRoot);
}

/**
 * 递归调用 将 fiber 节点更新到DOM上
 * @param {*} fiber
 */
function commitWork(fiber) {
  if (!fiber) return;
  // 找到当前 fiber 节点的挂载点
  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    // 如果不存在，那就一直向上找
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;
  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    // domParent.removeChild(fiber.dom);
    commitDeletion(fiber, domParent);
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    // 持续向下找，直到找到为止
    commitDeletion(fiber.child, domParent);
  }
}

function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = "";
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

/**
 *
 * @param {*} element VDom
 * @param {*} container 真实挂载的DOM节点
 */
function render(element, container) {
  console.log("事件循环的起点", element, container);
  // 即将开始工作的 基础单元
  wipRoot = {
    dom: container,
    props: {
      children: Array.isArray(element) ? [...element] : [element],
    },
    alternate: currentRoot,
  };
  // 新增记录删除的数组
  deletions = [];
  nextUnitOfWork = wipRoot;
}

function workLoop(deadline) {
  console.log("事件循环");
  // 是否可以继续工作
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // 剩余时间是否小于1
    const timeRemaining = deadline.timeRemaining();
    console.log("剩余时间", timeRemaining);
    // 如果此处的时间不足，可能导致多个节点时候的 performUnitOfWork 函数
    // 只进行了一半，就被浏览器打断了，导致界面上仅有部分节点。
    shouldYield = timeRemaining < 1;
  }
  // 如果下一个工作节点不存在，并且当前工作节点存在
  // 说明本次fiber节点更新结束 可以更新为 真实的 DOM
  if (!nextUnitOfWork && wipRoot) {
    console.time("渲染节点");
    commitRoot();
    console.timeEnd("渲染节点");
  }
  // 循环的核心在此处
  requestIdleCallback(workLoop);
}
// 类似于setTimeout，但是触发的时机 是浏览器 空闲时候进行调用一次。
requestIdleCallback(workLoop);

function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;
  // 处理子节点
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;
    // 老 fiber 节点和当前节点是否是同一类型
    const sameType = oldFiber && element && element.type == oldFiber.type;
    // 如果旧节点和新节点的类型相同
    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }
    // 当前节点存在，但是和老fiber节点的类型不同 做替换
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT",
      };
    }
    // 旧 fiber节点存在 但是不和当前节点类型相同 做删除
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }
    // 旧 fiber节点的 相邻节点存在，将其赋值给 旧 fiber节点，实现下次遍历 从 旧fiber节点开始
    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    // 当前是第一个节点，child 绑定到自身
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }
    prevSibling = newFiber;
    index++;
  }
}

/**
 * 处理 函数组件的方法，其 children 是其函数的返回值
 * @param {*} fiber 
 */
function updateFunctionComponent(fiber) {
  // 记录当前工作的函数组件节点
  wipFiber = fiber
  // 默认是第0个hook
  hookIndex = 0
  // 初始化当前函数组件的 hooks 队列，以便存储当前 fiber 的 hook
  wipFiber.hooks = []
  // 接受传入的props，执行函数组件，返回其对应的 fiber 节点，期间会执行 useState hook
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

/**
 * 保持原有的 jsx 处理逻辑
 * @param {*} fiber 
 */
function updateHostComponent(fiber) {
  // 当前fiber节点 不存在真实DOM，生成一个真实的DOM
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  // 遍历子节点，继续执行 children 属性来自于 createElement 函数。
  const elements = fiber.props.children;
  // 调和fiber节点
  reconcileChildren(fiber, elements);
}

/**
 * 在浏览器的一次循环中处理当前的vdom节点渲染到界面上，并返回下一个工作单元
 * @param {*} nextUnitOfWork
 */
function performUnitOfWork(fiber) {
  // 是否是函数组件
  const isFunctionComponent = fiber.type instanceof Function;
  
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }
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

function useState(initial) {
  // 获取 旧fiber 节点的对应的 hook
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex]
  const hook = {
    // 如果旧fiber节点存在，就使用旧的 state，如果不存在，就使用初始化的 state
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };
  // 首先看下当前hook中是否有任务要执行，
  const actions = oldHook ? oldHook.queue : [];
  // 存在任务 就进行执行
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });
  const setState = (action) => {
    // 存入 当前 hook 的 队列中
    hook.queue.push(action);
    // 从根节点开始持续向下进行更新，以便能正确的处理hook
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    // 无需任何的deletions处理
    deletions = [];
  };
  // 存入当前fiber节点的 hooks 队列中。
  wipFiber.hooks.push(hook)
  // 当前 fiber节点 hook 索引 + 1
  hookIndex++
  return [hook.state, setState];
}

const Didact = {
  createElement,
  render,
  useState,
};

/** @jsx Didact.createElement */
function Counter() {
  console.log('render');
  const [state, setState] = Didact.useState(1);
  return <h1 onClick={() => setState((c) => c + 1)}>Count: {state}</h1>;
}
const element = <Counter />;
const container = document.getElementById("root");
Didact.render(element, container);
